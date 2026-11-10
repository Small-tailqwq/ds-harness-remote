import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { networkInterfaces } from 'node:os'
import type { Duplex } from 'node:stream'
import {
  NoiseIkSession,
  NoiseSessionError,
  createLocalNoisePrologue,
  fromBase64Url,
  localPairingConfirmationCode,
  toBase64Url,
} from './crypto/index.js'
import {
  LOCAL_PAIR_APPROVAL_CAPABILITY,
  LOCAL_PAIRING_APPROVAL_MS,
  LOCAL_DIRECT_PATH,
  LOCAL_DIRECT_VERSION,
  LOCAL_HEARTBEAT_INTERVAL_MS,
  LOCAL_MAX_PENDING_SOCKETS,
  LOCAL_MAX_PREAUTH_FRAME_BYTES,
  LOCAL_MAX_TRANSPORT_FRAME_BYTES,
  LOCAL_PREAUTH_TIMEOUT_MS,
  SecureMessageCodec,
  decodeLocalControlFrame,
  decodeLocalPairFrame,
  decodeMessage,
  encodeLocalControlFrame,
  encodeLocalPairFrame,
  encodeMessage,
  formatLocalAddress,
  isPrivateNetworkAddress,
  type LocalControlFrame,
  type LocalErrorCode,
  type LocalHelloPayload,
  type RemoteMessage,
} from './protocol/index.js'
import { SerialSend, waitForRelayCapacity } from './webrtc.js'
import { WebSocketServer, type RawData, type WebSocket } from 'ws'
import type { ResolvedLocalConfig } from './config.js'
import { fingerprint, type HostIdentity } from './identity-store.js'
import { uuidV7 } from './ids.js'
import { LOCAL_MEMBERSHIP_PREFIX, type LocalPairingStore, type PairedDevice } from './local-pairing.js'
import type { SafeLogger } from './logging.js'
import type { PairingDecision, PairingGate } from './pairing-gate.js'
import type { AuthenticatedPeerChannel } from './types.js'

/** On-demand latency probes give up after this long. */
const RTT_PROBE_TIMEOUT_MS = 3_000

export interface LocalDirectHostOptions {
  config: ResolvedLocalConfig
  identity: HostIdentity
  pairing: LocalPairingStore
  /** In-memory pairing window opened from the Desktop UI. */
  gate: PairingGate
  logger: SafeLogger
  accept: (channel: AuthenticatedPeerChannel) => Promise<void>
  /** True when the device id is already authorized by the account trust store. */
  conflictsWithAccount: (deviceId: string) => boolean
  hostVersion?: string
  /** Interface enumeration, injectable for tests. */
  interfaces?: () => ReturnType<typeof networkInterfaces>
  now?: () => number
}

export interface LocalDirectStatus {
  listening: boolean
  addresses: string[]
  error?: string
}

/** Per-IP admission budget for unauthenticated sockets. */
const ADMISSION_WINDOW_MS = 60_000
const ADMISSIONS_PER_WINDOW = 20

const CLOSE_NORMAL = 1000
const CLOSE_POLICY = 1008

export class LocalDirectHost {
  private readonly servers: Server[] = []
  private readonly wss = new WebSocketServer({
    noServer: true,
    maxPayload: LOCAL_MAX_TRANSPORT_FRAME_BYTES,
    perMessageDeflate: false,
  })
  private readonly sockets = new Set<WebSocket>()
  private readonly admissions = new Map<string, number[]>()
  private pending = 0
  private addresses: string[] = []
  private stopped = true
  private error?: string
  private heartbeat?: ReturnType<typeof setInterval>
  private readonly now: () => number

  constructor(private readonly options: LocalDirectHostOptions) {
    this.now = options.now ?? Date.now
  }

  async start(): Promise<void> {
    if (!this.stopped) return
    this.stopped = false
    this.error = undefined
    const hosts = resolveBindHosts(this.options.config.bind, this.options.interfaces ?? networkInterfaces)
    if (hosts.length === 0) {
      this.error = 'NO_PRIVATE_ADDRESS'
      this.options.logger.warn('local direct has no private address to listen on')
      return
    }
    const bound: string[] = []
    for (const host of hosts) {
      const server = createServer((_request, response) => {
        response.writeHead(404).end()
      })
      server.on('upgrade', (request, socket, head) => this.upgrade(request, socket, head))
      server.on('clientError', (_error, socket) => socket.destroy())
      try {
        await listen(server, this.options.config.port, host)
        this.servers.push(server)
        // Port 0 (tests) binds an ephemeral port; advertise the real one.
        bound.push(formatLocalAddress({ host, port: (server.address() as AddressInfo).port }))
      } catch (error) {
        server.close()
        this.options.logger.warn('local direct could not listen on an address', {
          address: formatLocalAddress({ host, port: this.options.config.port }),
          code: (error as NodeJS.ErrnoException).code ?? 'LISTEN_FAILED',
        })
      }
    }
    this.addresses = bound
    if (bound.length === 0) {
      this.error = 'LISTEN_FAILED'
      return
    }
    this.heartbeat = setInterval(() => this.ping(), LOCAL_HEARTBEAT_INTERVAL_MS)
    this.heartbeat.unref?.()
    this.options.logger.info('local direct listening', { addresses: bound })
  }

  async stop(): Promise<void> {
    if (this.stopped) return
    this.stopped = true
    if (this.heartbeat !== undefined) clearInterval(this.heartbeat)
    for (const socket of this.sockets) {
      sendError(socket, 'HOST_STOPPING', 'The Host is stopping.')
      socket.terminate()
    }
    this.sockets.clear()
    await Promise.all(this.servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))))
    this.addresses = []
  }

  status(): LocalDirectStatus {
    return {
      listening: !this.stopped && this.addresses.length > 0,
      addresses: [...this.addresses],
      ...(this.error === undefined ? {} : { error: this.error }),
    }
  }

  private upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    const remote = request.socket.remoteAddress ?? ''
    const path = request.url?.split('?')[0]
    if (this.stopped || path !== LOCAL_DIRECT_PATH) {
      socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n')
      return
    }
    if (!isPrivateNetworkAddress(normalizeRemote(remote))) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
      return
    }
    if (this.pending >= LOCAL_MAX_PENDING_SOCKETS || !this.admit(remote)) {
      socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n')
      return
    }
    this.wss.handleUpgrade(request, socket, head, ws => {
      this.sockets.add(ws)
      ws.on('close', () => this.sockets.delete(ws))
      void this.handshake(ws, remote)
    })
  }

  private admit(remote: string): boolean {
    const now = this.now()
    const recent = (this.admissions.get(remote) ?? []).filter(at => now - at < ADMISSION_WINDOW_MS)
    if (recent.length >= ADMISSIONS_PER_WINDOW) {
      this.admissions.set(remote, recent)
      return false
    }
    recent.push(now)
    this.admissions.set(remote, recent)
    if (this.admissions.size > 1024) {
      for (const [key, times] of this.admissions) if (times.every(at => now - at >= ADMISSION_WINDOW_MS)) this.admissions.delete(key)
    }
    return true
  }

  private async handshake(ws: WebSocket, remote: string): Promise<void> {
    this.pending += 1
    const inbox = new FrameInbox(ws)
    const timer = setTimeout(() => {
      sendError(ws, 'INVALID_MESSAGE', 'The secure channel was not established in time.')
      ws.terminate()
    }, LOCAL_PREAUTH_TIMEOUT_MS)
    let noise: NoiseIkSession | undefined
    try {
      const hello = expectControl(await inbox.next(LOCAL_MAX_PREAUTH_FRAME_BYTES), 'local.hello').payload
      const rejection = await this.checkHello(hello)
      if (rejection !== undefined) throw new LocalRejection(rejection[0], rejection[1])

      const connectionId = uuidV7(this.now())
      const identity = this.options.identity
      ws.send(encodeLocalControlFrame({
        v: LOCAL_DIRECT_VERSION,
        type: 'local.hello.ack',
        payload: {
          hostDeviceId: identity.deviceId,
          hostIdentityKey: identity.publicKey,
          name: identity.name,
          connectionId,
          // Capabilities are negotiated inside the secure channel; nothing is
          // advertised to a peer that has not authenticated yet.
          capabilities: [],
          ...(this.options.hostVersion === undefined ? {} : { hostVersion: this.options.hostVersion }),
        },
      }))

      noise = new NoiseIkSession({
        role: 'responder',
        localPrivateKey: identity.privateKey,
        localPublicKey: identity.publicKey,
        remotePublicKey: hello.clientIdentityKey,
        prologue: createLocalNoisePrologue(connectionId, identity.deviceId, hello.clientDeviceId),
      })
      const step1 = expectControl(await inbox.next(LOCAL_MAX_PREAUTH_FRAME_BYTES), 'secure.handshake').payload
      if (step1.connectionId !== connectionId || step1.step !== 1) throw new LocalRejection('SECURE_CHANNEL_FAILED', 'Unexpected handshake message.')
      noise.readHandshake(fromBase64Url(step1.data))
      const reply = noise.writeHandshake()
      if (!noise.complete) throw new LocalRejection('SECURE_CHANNEL_FAILED', 'The handshake did not complete.')
      ws.send(encodeLocalControlFrame({
        v: LOCAL_DIRECT_VERSION,
        type: 'secure.handshake',
        payload: { connectionId, step: 2, data: toBase64Url(reply) },
      }))

      let device: PairedDevice | undefined = this.options.pairing.pairedDevice(hello.clientDeviceId)
      if (hello.intent === 'pair') {
        const proofFrame = await inbox.next(LOCAL_MAX_PREAUTH_FRAME_BYTES)
        if (proofFrame.text) throw new LocalRejection('INVALID_MESSAGE', 'Pairing proof must be encrypted.')
        const prove = decodeLocalPairFrame(noise.decrypt(proofFrame.data))
        if (prove.type !== 'local.pair.prove') throw new LocalRejection('INVALID_MESSAGE', 'Expected a pairing proof.')
        const handshakeHash = noise.handshakeHash()
        const result = this.options.gate.verifyProof(handshakeHash, prove.payload.proof)
        if (!result.ok) {
          this.options.logger.warn('local direct pairing rejected', { reason: result.reason })
          throw new LocalRejection(result.reason === 'closed' ? 'PAIRING_CLOSED' : 'PAIRING_REJECTED', 'Pairing was not accepted.')
        }
        // The code only proves the phone saw the QR code. A person at the
        // computer still decides, comparing the code both screens show.
        clearTimeout(timer)
        const withdrawn = new AbortController()
        const onGone = (): void => withdrawn.abort()
        ws.once('close', onGone)
        let decision: PairingDecision
        try {
          const approval = this.options.gate.requestApproval({
            deviceId: hello.clientDeviceId,
            name: hello.name,
            platform: hello.platform,
            fingerprint: fingerprint(hello.clientIdentityKey),
            address: shortRemote(normalizeRemote(remote)),
            confirmationCode: localPairingConfirmationCode(handshakeHash),
          }, withdrawn.signal)
          const timeoutMs = this.options.gate.current()?.request?.expiresAt
          ws.send(noise.encrypt(encodeLocalPairFrame({
            v: LOCAL_DIRECT_VERSION,
            type: 'local.pair.pending',
            payload: { timeoutMs: timeoutMs === undefined ? LOCAL_PAIRING_APPROVAL_MS : Math.max(1_000, timeoutMs - this.now()) },
          })))
          this.options.logger.info('local direct pairing awaits approval', { peerDeviceId: shortId(hello.clientDeviceId) })
          decision = await approval
        } finally {
          ws.off('close', onGone)
        }
        if (decision !== 'approved') {
          this.options.logger.info('local direct pairing not approved', { decision })
          throw new LocalRejection(...pairingRejection(decision))
        }
        device = await this.options.pairing.pair({
          deviceId: hello.clientDeviceId,
          publicKey: hello.clientIdentityKey,
          name: hello.name,
          platform: hello.platform,
        })
        ws.send(noise.encrypt(encodeLocalPairFrame({
          v: LOCAL_DIRECT_VERSION,
          type: 'local.pair.ok',
          payload: { pairingId: device.pairingId },
        })))
        this.options.logger.info('local direct device paired', {
          peerDeviceId: shortId(device.deviceId),
          fingerprint: device.fingerprint,
        })
      }
      if (device === undefined || device.publicKey !== hello.clientIdentityKey) {
        throw new LocalRejection('PEER_NOT_PAIRED', 'Pair this device with the Host first.')
      }

      clearTimeout(timer)
      inbox.detach()
      const channel = new LocalNoiseChannel(ws, noise, connectionId, device, inbox.drain(), {
        remoteAddress: shortRemote(normalizeRemote(remote)),
        connectedAt: this.now(),
        latency: latencyOf(ws),
      })
      noise = undefined
      await this.options.accept(channel)
      void channel.measureRtt()
    } catch (error) {
      clearTimeout(timer)
      noise?.destroy()
      inbox.detach()
      const [code, message]: [LocalErrorCode, string] = error instanceof LocalRejection
        ? [error.code, error.message]
        : error instanceof NoiseSessionError
          ? ['SECURE_CHANNEL_FAILED', 'The secure handshake failed.']
          : ['INVALID_MESSAGE', 'The connection was rejected.']
      if (!(error instanceof LocalRejection)) {
        this.options.logger.debug('local direct handshake failed', { remote: shortRemote(remote) })
      }
      sendError(ws, code, message)
      ws.close(CLOSE_POLICY)
    } finally {
      this.pending -= 1
    }
  }

  private async checkHello(hello: LocalHelloPayload): Promise<[LocalErrorCode, string] | undefined> {
    await this.options.pairing.reload()
    if (hello.clientIdentityKey === this.options.identity.publicKey) {
      return ['PEER_IDENTITY_MISMATCH', 'The Client presented the Host identity.']
    }
    if (this.options.conflictsWithAccount(hello.clientDeviceId)) {
      return ['PEER_IDENTITY_MISMATCH', 'This device id is already used by an account connection.']
    }
    if (hello.intent === 'pair') {
      if (!hello.capabilities.includes(LOCAL_PAIR_APPROVAL_CAPABILITY)) {
        return ['UNSUPPORTED_VERSION', 'Update the app to pair: this Host asks for approval on the computer.']
      }
      return this.options.gate.accepting()
        ? undefined
        : ['PAIRING_CLOSED', 'Open pairing on the Host first.']
    }
    const device = this.options.pairing.pairedDevice(hello.clientDeviceId)
    if (device === undefined) return ['PEER_NOT_PAIRED', 'Pair this device with the Host first.']
    if (device.publicKey !== hello.clientIdentityKey) return ['PEER_IDENTITY_MISMATCH', 'This device presented a different identity.']
    return undefined
  }

  /** Heartbeat: a socket that missed the previous pong is gone; every pong also samples latency. */
  private ping(): void {
    for (const socket of this.sockets) {
      const latency = latencyOf(socket)
      if (!latency.alive) {
        socket.terminate()
        continue
      }
      latency.alive = false
      void latency.probe(LOCAL_HEARTBEAT_INTERVAL_MS)
    }
  }
}

/**
 * Round-trip time from WebSocket ping/pong on one socket. Each ping carries its
 * own id so a late pong is never matched to a newer probe.
 */
class SocketLatency {
  alive = true
  rttMs?: number
  measuredAt?: number
  private sequence = 0
  private readonly waiting = new Map<string, { sentAt: number; resolve: (rtt: number | undefined) => void; timer: ReturnType<typeof setTimeout> }>()

  constructor(private readonly ws: WebSocket) {
    ws.on('pong', data => this.onPong(rawBytes(data)))
    ws.on('close', () => {
      for (const entry of this.waiting.values()) {
        clearTimeout(entry.timer)
        entry.resolve(undefined)
      }
      this.waiting.clear()
    })
  }

  probe(timeoutMs = RTT_PROBE_TIMEOUT_MS): Promise<number | undefined> {
    if (this.ws.readyState !== this.ws.OPEN) return Promise.resolve(undefined)
    this.sequence = (this.sequence + 1) % 1_000_000
    const id = String(this.sequence)
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        this.waiting.delete(id)
        resolve(undefined)
      }, timeoutMs)
      timer.unref?.()
      this.waiting.set(id, { sentAt: performance.now(), resolve, timer })
      try {
        this.ws.ping(Buffer.from(id))
      } catch {
        clearTimeout(timer)
        this.waiting.delete(id)
        resolve(undefined)
      }
    })
  }

  private onPong(data: Uint8Array): void {
    this.alive = true
    const id = Buffer.from(data).toString('utf8')
    const entry = this.waiting.get(id)
    if (entry === undefined) return
    this.waiting.delete(id)
    clearTimeout(entry.timer)
    const rtt = Math.max(0, Math.round((performance.now() - entry.sentAt) * 10) / 10)
    this.rttMs = rtt
    this.measuredAt = Date.now()
    entry.resolve(rtt)
  }
}

const latencies = new WeakMap<WebSocket, SocketLatency>()

function latencyOf(ws: WebSocket): SocketLatency {
  let latency = latencies.get(ws)
  if (latency === undefined) {
    latency = new SocketLatency(ws)
    latencies.set(ws, latency)
  }
  return latency
}

function pairingRejection(decision: Exclude<PairingDecision, 'approved'>): [LocalErrorCode, string] {
  switch (decision) {
    case 'denied': return ['PAIRING_DENIED', 'Pairing was declined on the computer.']
    case 'expired': return ['PAIRING_EXPIRED', 'Pairing was not approved in time.']
    case 'closed': return ['PAIRING_CLOSED', 'Pairing was closed on the computer.']
  }
}

/** Authenticated Local Direct peer channel handed to the ConnectionController. */
class LocalNoiseChannel implements AuthenticatedPeerChannel {
  readonly security
  readonly peerDeviceId: string
  readonly peerIdentityKey: string
  readonly mode = 'LAN' as const
  readonly trustScope = 'local' as const
  private readonly handlers = new Set<(message: RemoteMessage) => void>()
  private readonly closeHandlers = new Set<() => void>()
  private readonly incoming = new SecureMessageCodec()
  private readonly outgoing = new SecureMessageCodec()
  private readonly sends = new SerialSend()
  private sendTail: Promise<void> = Promise.resolve()
  private closed = false
  /** Messages that arrive before the controller subscribes are held, not dropped. */
  private early: RemoteMessage[] | undefined = []

  constructor(
    private readonly ws: WebSocket,
    private readonly noise: NoiseIkSession,
    connectionId: string,
    device: PairedDevice,
    queued: readonly InboundFrame[],
    private readonly link: { remoteAddress: string; connectedAt: number; latency: SocketLatency },
  ) {
    this.security = {
      protocol: 'Noise_IK_25519_ChaChaPoly_SHA256' as const,
      connectionId,
      membershipId: `${LOCAL_MEMBERSHIP_PREFIX}${device.pairingId}`,
    }
    this.peerDeviceId = device.deviceId
    this.peerIdentityKey = device.publicKey
    for (const frame of queued) this.receiveBytes(frame.data, !frame.text)
    ws.on('message', (data, isBinary) => this.receiveBytes(rawBytes(data), isBinary))
    ws.on('close', () => { void this.close() })
    ws.on('error', () => { void this.close() })
  }

  get remoteAddress(): string { return this.link.remoteAddress }
  get connectedAt(): number { return this.link.connectedAt }
  get rttMs(): number | undefined { return this.link.latency.rttMs }

  measureRtt(): Promise<number | undefined> {
    return this.closed ? Promise.resolve(undefined) : this.link.latency.probe()
  }

  send(message: RemoteMessage): Promise<void> {
    const run = this.sendTail.then(() => this.sendNow(message))
    this.sendTail = run.catch(() => undefined)
    return run
  }

  private async sendNow(message: RemoteMessage): Promise<void> {
    if (this.closed) throw new Error('secure channel is closed')
    const encoded = encodeMessage(message)
    try {
      await this.sends.run(encoded.byteLength, async () => {
        for (const plaintext of this.outgoing.encode(encoded)) {
          if (this.closed) throw new Error('secure channel is closed')
          await waitForRelayCapacity(this.ws)
          const ciphertext = this.noise.encrypt(plaintext)
          await new Promise<void>((resolve, reject) => this.ws.send(ciphertext, { binary: true }, error => error ? reject(error) : resolve()))
        }
      })
    } catch (error) {
      await this.close().catch(() => undefined)
      throw error
    }
  }

  onClose(handler: () => void): () => void {
    if (this.closed) {
      queueMicrotask(handler)
      return () => undefined
    }
    this.closeHandlers.add(handler)
    return () => { this.closeHandlers.delete(handler) }
  }

  onMessage(handler: (message: RemoteMessage) => void): () => void {
    this.handlers.add(handler)
    const early = this.early
    this.early = undefined
    for (const message of early ?? []) handler(message)
    return () => this.handlers.delete(handler)
  }

  private receiveBytes(data: Uint8Array, isBinary: boolean): void {
    if (this.closed) return
    try {
      if (!isBinary) throw new Error('Text frames are not allowed after the secure channel is ready.')
      const plaintext = this.incoming.decode(this.noise.decrypt(data))
      if (plaintext === undefined) return
      const message = decodeMessage(plaintext)
      if (this.early !== undefined) {
        if (this.early.length >= 64) throw new Error('Too many messages before the connection was accepted.')
        this.early.push(message)
        return
      }
      for (const handler of this.handlers) handler(message)
    } catch {
      // Authentication, ordering and fragment failures fail closed.
      void this.close('SECURE_CHANNEL_FAILED')
    }
  }

  async close(code?: string): Promise<void> {
    if (this.closed) return
    this.closed = true
    this.handlers.clear()
    const closeHandlers = [...this.closeHandlers]
    this.closeHandlers.clear()
    for (const handler of closeHandlers) handler()
    this.early = undefined
    this.incoming.reset()
    this.outgoing.reset()
    this.noise.destroy()
    if (this.ws.readyState === this.ws.OPEN || this.ws.readyState === this.ws.CONNECTING) {
      this.ws.close(code === undefined || code === 'NORMAL' ? CLOSE_NORMAL : CLOSE_POLICY, code?.slice(0, 64))
    }
  }
}

interface InboundFrame {
  text: boolean
  data: Uint8Array
}

/** Sequential reader for the pre-auth phase; any socket failure rejects the waiter. */
class FrameInbox {
  private readonly queue: InboundFrame[] = []
  private waiter?: { resolve: (frame: InboundFrame) => void; reject: (error: Error) => void }
  private failure?: Error
  private readonly onMessage = (data: RawData, isBinary: boolean) => {
    const frame = { text: !isBinary, data: rawBytes(data) }
    if (this.waiter !== undefined) {
      const waiter = this.waiter
      this.waiter = undefined
      waiter.resolve(frame)
    } else if (this.queue.length < 4) this.queue.push(frame)
    else this.fail(new LocalRejection('INVALID_MESSAGE', 'Too many frames before the secure channel is ready.'))
  }
  private readonly onClose = () => this.fail(new Error('socket closed'))

  constructor(private readonly ws: WebSocket) {
    ws.on('message', this.onMessage)
    ws.on('close', this.onClose)
    ws.on('error', this.onClose)
  }

  next(maxBytes: number): Promise<InboundFrame> {
    if (this.failure !== undefined) return Promise.reject(this.failure)
    const queued = this.queue.shift()
    const frame = queued === undefined
      ? new Promise<InboundFrame>((resolve, reject) => { this.waiter = { resolve, reject } })
      : Promise.resolve(queued)
    return frame.then(value => {
      if (value.data.byteLength > maxBytes) throw new LocalRejection('INVALID_MESSAGE', 'Frame exceeds the pre-auth limit.')
      return value
    })
  }

  drain(): InboundFrame[] {
    return this.queue.splice(0)
  }

  detach(): void {
    this.ws.off('message', this.onMessage)
    this.ws.off('close', this.onClose)
    this.ws.off('error', this.onClose)
  }

  private fail(error: Error): void {
    this.failure ??= error
    const waiter = this.waiter
    this.waiter = undefined
    waiter?.reject(this.failure)
  }
}

class LocalRejection extends Error {
  constructor(readonly code: LocalErrorCode, message: string) { super(message) }
}

function expectControl<T extends LocalControlFrame['type']>(frame: InboundFrame, type: T): Extract<LocalControlFrame, { type: T }> {
  if (!frame.text) throw new LocalRejection('INVALID_MESSAGE', 'Expected a control frame.')
  let decoded: LocalControlFrame
  try {
    decoded = decodeLocalControlFrame(frame.data)
  } catch {
    throw new LocalRejection('INVALID_MESSAGE', 'The control frame is invalid.')
  }
  if (decoded.type !== type) throw new LocalRejection('INVALID_MESSAGE', `Expected ${type}.`)
  return decoded as Extract<LocalControlFrame, { type: T }>
}

function sendError(ws: WebSocket, code: LocalErrorCode, message: string): void {
  if (ws.readyState !== ws.OPEN) return
  try {
    ws.send(encodeLocalControlFrame({ v: LOCAL_DIRECT_VERSION, type: 'local.error', payload: { code, message } }))
  } catch {
    // Best effort before closing.
  }
}

/** Private interface addresses, or the configured ones after validating they are private. */
export function resolveBindHosts(bind: readonly string[], interfaces: () => ReturnType<typeof networkInterfaces>): string[] {
  if (bind.length > 0) {
    for (const host of bind) {
      if (!isPrivateNetworkAddress(host)) throw new TypeError(`local.bind address ${host} is not a private-network address`)
    }
    return [...new Set(bind.map(host => host.toLowerCase()))]
  }
  const hosts = new Set<string>()
  for (const entries of Object.values(interfaces())) {
    for (const entry of entries ?? []) {
      const host = entry.address.toLowerCase()
      // Link-local IPv6 needs a zone id to bind; loopback is covered by 127.0.0.1.
      if (host.startsWith('fe80:') || host === '::1') continue
      if (isPrivateNetworkAddress(host)) hosts.add(host)
    }
  }
  return [...hosts]
}

function listen(server: Server, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => { server.off('listening', onListening); reject(error) }
    const onListening = () => { server.off('error', onError); resolve() }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen({ port, host, exclusive: true })
  })
}

function normalizeRemote(address: string): string {
  const lower = address.toLowerCase()
  const zone = lower.indexOf('%')
  return zone === -1 ? lower : lower.slice(0, zone)
}

function rawBytes(data: RawData): Uint8Array {
  if (Array.isArray(data)) return new Uint8Array(Buffer.concat(data))
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
}

function shortId(value: string): string { return value.length <= 12 ? value : `${value.slice(0, 8)}…${value.slice(-4)}` }
function shortRemote(value: string): string { return value.replace(/^::ffff:/u, '') }
