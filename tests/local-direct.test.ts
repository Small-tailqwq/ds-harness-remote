import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  NoiseIkSession,
  createLocalNoisePrologue,
  createLocalPairingProof,
  fromBase64Url,
  generateKeyPair,
  toBase64Url,
  type KeyPair,
} from '../src/crypto/index.js'
import {
  LOCAL_DIRECT_PATH,
  LOCAL_PAIRING_MAX_FAILURES,
  createRpcRequest,
  createRpcResponse,
  decodeLocalControlFrame,
  decodeLocalPairFrame,
  decodeMessage,
  encodeLocalControlFrame,
  encodeLocalPairFrame,
  encodeMessage,
  type RemoteMessage,
} from '../src/protocol/index.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'
import { runScenarios } from './test-scenarios.mjs'
import { ConnectionController } from '../src/connection-controller.js'
import type { HostIdentity } from '../src/identity-store.js'
import { uuidV7 } from '../src/ids.js'
import { LocalDirectHost, resolveBindHosts } from '../src/local-host.js'
import { LocalPairingStore } from '../src/local-pairing.js'
import { SafeLogger } from '../src/logging.js'
import type { RpcRouter } from '../src/rpc-router.js'

const logger = new SafeLogger({ debug() {}, info() {}, warn() {}, error() {} }, 'error')

interface Fixture {
  root: string
  clock: { now: number }
  pairing: LocalPairingStore
  identity: HostIdentity
  controller: ConnectionController
  host: LocalDirectHost
  address: string
}

let fixture: Fixture

async function createFixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-local-direct-'))
  const clock = { now: Date.now() }
  const pairing = new LocalPairingStore(root, () => clock.now)
  const identity = await pairing.loadIdentity('Test Host')
  const controller = new ConnectionController(
    pairing,
    (_context, send) => ({
      // Echo each request back as a response so both directions are exercised.
      handle: vi.fn(async (message: RemoteMessage) => { await send(createRpcResponse(message.id, { echoed: message.payload })) }),
      closePeerStreams: vi.fn(async () => undefined),
    }) as unknown as RpcRouter,
    logger,
  )
  const host = new LocalDirectHost({
    config: { enabled: true, port: 0, bind: ['127.0.0.1'] },
    identity,
    pairing,
    logger,
    accept: channel => controller.accept(channel),
    conflictsWithAccount: () => false,
    now: () => clock.now,
  })
  await host.start()
  return { root, clock, pairing, identity, controller, host, address: host.status().addresses[0]! }
}

beforeEach(async () => { fixture = await createFixture() })
afterEach(async () => {
  await fixture.host.stop()
  await fixture.controller.close()
  await rm(fixture.root, { recursive: true, force: true })
})

async function reset(): Promise<void> {
  await fixture.host.stop()
  await fixture.controller.close()
  await rm(fixture.root, { recursive: true, force: true })
  fixture = await createFixture()
}

interface TestClient {
  deviceId: string
  keys: KeyPair
}

function newClient(): TestClient {
  return { deviceId: uuidV7(), keys: generateKeyPair() }
}

type ConnectResult =
  | { ok: true; ws: WebSocket; noise: NoiseIkSession; inbox: Inbox }
  | { ok: false; code: string }

class Inbox {
  private readonly frames: Array<{ text: boolean; data: Buffer }> = []
  private waiters: Array<(frame: { text: boolean; data: Buffer } | undefined) => void> = []
  private closed = false
  constructor(ws: WebSocket) {
    ws.on('message', (data: Buffer, isBinary: boolean) => this.push({ text: !isBinary, data }))
    ws.on('close', () => { this.closed = true; for (const waiter of this.waiters.splice(0)) waiter(undefined) })
  }
  private push(frame: { text: boolean; data: Buffer }): void {
    const waiter = this.waiters.shift()
    if (waiter) waiter(frame)
    else this.frames.push(frame)
  }
  next(): Promise<{ text: boolean; data: Buffer } | undefined> {
    const frame = this.frames.shift()
    if (frame !== undefined || this.closed) return Promise.resolve(frame)
    return new Promise(resolve => this.waiters.push(resolve))
  }
}

async function connect(client: TestClient, options: {
  intent: 'connect' | 'pair'
  pairingCode?: string
  proof?: (hash: Uint8Array) => string
  identityKey?: string
}): Promise<ConnectResult> {
  const ws = new WebSocket(`ws://${fixture.address}${LOCAL_DIRECT_PATH}`)
  await new Promise<void>((resolve, reject) => { ws.once('open', () => resolve()); ws.once('error', reject) })
  const inbox = new Inbox(ws)
  const fail = (frame: { text: boolean; data: Buffer } | undefined): ConnectResult => {
    ws.terminate()
    if (frame === undefined) return { ok: false, code: 'CLOSED' }
    const decoded = decodeLocalControlFrame(frame.data)
    return { ok: false, code: decoded.type === 'local.error' ? decoded.payload.code : `UNEXPECTED_${decoded.type}` }
  }
  ws.send(encodeLocalControlFrame({
    v: 1,
    type: 'local.hello',
    payload: {
      clientDeviceId: client.deviceId,
      clientIdentityKey: options.identityKey ?? client.keys.publicKey,
      name: 'Phone',
      platform: 'dsh-app-android',
      capabilities: [],
      intent: options.intent,
    },
  }))
  const ackFrame = await inbox.next()
  const ack = ackFrame?.text ? decodeLocalControlFrame(ackFrame.data) : undefined
  if (ack?.type !== 'local.hello.ack') return fail(ackFrame)
  expect(ack.payload.hostIdentityKey).toBe(fixture.identity.publicKey)
  const noise = new NoiseIkSession({
    role: 'initiator',
    localPrivateKey: client.keys.privateKey,
    localPublicKey: client.keys.publicKey,
    remotePublicKey: fixture.identity.publicKey,
    prologue: createLocalNoisePrologue(ack.payload.connectionId, ack.payload.hostDeviceId, client.deviceId),
  })
  ws.send(encodeLocalControlFrame({
    v: 1,
    type: 'secure.handshake',
    payload: { connectionId: ack.payload.connectionId, step: 1, data: toBase64Url(noise.writeHandshake()) },
  }))
  const step2Frame = await inbox.next()
  const step2 = step2Frame?.text ? decodeLocalControlFrame(step2Frame.data) : undefined
  if (step2?.type !== 'secure.handshake') return fail(step2Frame)
  noise.readHandshake(fromBase64Url(step2.payload.data))
  if (options.intent === 'pair') {
    const proof = options.proof?.(noise.handshakeHash()) ?? createLocalPairingProof(options.pairingCode!, noise.handshakeHash())
    ws.send(noise.encrypt(encodeLocalPairFrame({ v: 1, type: 'local.pair.prove', payload: { proof } })))
    const okFrame = await inbox.next()
    if (okFrame === undefined || okFrame.text) return fail(okFrame)
    expect(decodeLocalPairFrame(noise.decrypt(okFrame.data)).type).toBe('local.pair.ok')
  }
  return { ok: true, ws, noise, inbox }
}

async function roundTrip(result: ConnectResult): Promise<unknown> {
  if (!result.ok) throw new Error(`not connected: ${result.code}`)
  const request = createRpcRequest('harness.transport.describe', { probe: 1 })
  result.ws.send(result.noise.encrypt(encodeMessage(request)))
  const frame = await result.inbox.next()
  if (frame === undefined || frame.text) throw new Error('no encrypted response')
  const response = decodeMessage(result.noise.decrypt(frame.data))
  expect(response.payload).toMatchObject({ requestId: request.id })
  return response.payload
}

async function pairNew(): Promise<{ client: TestClient; result: ConnectResult }> {
  const window = await fixture.pairing.openWindow()
  const client = newClient()
  return { client, result: await connect(client, { intent: 'pair', pairingCode: window.code }) }
}

describe('Local Direct Host', () => {
  it('pairs with a one-time code, then reconnects with the pinned identity only', async () => {
    const { client, result } = await pairNew()
    expect(result.ok).toBe(true)
    expect(await roundTrip(result)).toMatchObject({ result: { echoed: { params: { probe: 1 } } } })
    expect(fixture.controller.connectedPeers()).toEqual([{ deviceId: client.deviceId, mode: 'LAN' }])
    expect(fixture.pairing.pairedDevice(client.deviceId)?.publicKey).toBe(client.keys.publicKey)
    // The code was consumed by the successful pairing.
    expect(await fixture.pairing.activeWindow()).toBeUndefined()
    if (result.ok) result.ws.close()

    const again = await connect(client, { intent: 'connect' })
    expect(again.ok).toBe(true)
    expect(await roundTrip(again)).toMatchObject({ result: { echoed: { params: { probe: 1 } } } })
    if (again.ok) again.ws.close()
  })

  it('fails closed for every unauthorized connection attempt', async () => {
    await runScenarios([
      {
        name: 'unpaired device asking to connect',
        run: async () => expect(await connect(newClient(), { intent: 'connect' })).toEqual({ ok: false, code: 'PEER_NOT_PAIRED' }),
      },
      {
        name: 'pairing while no window is open',
        run: async () => expect(await connect(newClient(), { intent: 'pair', pairingCode: 'wMHCw8TFxsfIycrLzM3Ozw' }))
          .toEqual({ ok: false, code: 'PAIRING_CLOSED' }),
      },
      {
        name: 'pairing with the wrong code',
        run: async () => {
          await fixture.pairing.openWindow()
          expect(await connect(newClient(), { intent: 'pair', pairingCode: 'wMHCw8TFxsfIycrLzM3Ozw' }))
            .toEqual({ ok: false, code: 'PAIRING_REJECTED' })
          expect(fixture.controller.connectionCount()).toBe(0)
        },
      },
      {
        name: 'proof replayed from another handshake',
        run: async () => {
          const window = await fixture.pairing.openWindow()
          const stale = createLocalPairingProof(window.code, new Uint8Array(32))
          expect(await connect(newClient(), { intent: 'pair', proof: () => stale })).toEqual({ ok: false, code: 'PAIRING_REJECTED' })
        },
      },
      {
        name: 'expired pairing window',
        run: async () => {
          const window = await fixture.pairing.openWindow()
          fixture.clock.now += 5 * 60_000 + 1
          expect(await connect(newClient(), { intent: 'pair', pairingCode: window.code })).toEqual({ ok: false, code: 'PAIRING_CLOSED' })
        },
      },
      {
        name: 'paired device id presenting another key',
        run: async () => {
          const { client, result } = await pairNew()
          if (result.ok) result.ws.close()
          const impostor = { deviceId: client.deviceId, keys: generateKeyPair() }
          expect(await connect(impostor, { intent: 'connect' })).toEqual({ ok: false, code: 'PEER_IDENTITY_MISMATCH' })
        },
      },
      {
        name: 'claimed key the Client cannot prove',
        run: async () => {
          const { client, result } = await pairNew()
          if (result.ok) result.ws.close()
          // Hello names the paired key, but the handshake is signed with another one.
          const forged = { deviceId: client.deviceId, keys: generateKeyPair() }
          expect(await connect(forged, { intent: 'connect', identityKey: client.keys.publicKey })).toEqual({ ok: false, code: 'SECURE_CHANNEL_FAILED' })
        },
      },
    ], reset)
  })

  it('closes the pairing window after repeated wrong proofs', async () => {
    const window = await fixture.pairing.openWindow()
    for (let attempt = 0; attempt < LOCAL_PAIRING_MAX_FAILURES; attempt += 1) {
      expect(await connect(newClient(), { intent: 'pair', proof: () => createLocalPairingProof('wMHCw8TFxsfIycrLzM3Ozw', new Uint8Array(32)) }))
        .toMatchObject({ ok: false })
    }
    expect(await connect(newClient(), { intent: 'pair', pairingCode: window.code })).toEqual({ ok: false, code: 'PAIRING_CLOSED' })
  })

  it('drops the active connection when its pairing is revoked by another process', async () => {
    const { client, result } = await pairNew()
    expect(result.ok).toBe(true)
    // The CLI edits the same files from a separate store instance.
    const cli = new LocalPairingStore(fixture.root, () => fixture.clock.now)
    expect(await cli.revoke(client.deviceId)).toBe(true)
    expect(await fixture.pairing.reload()).toBe(true)
    await fixture.controller.revokeUntrustedLocal()
    expect(fixture.controller.connectionCount()).toBe(0)
    expect(await connect(client, { intent: 'connect' })).toEqual({ ok: false, code: 'PEER_NOT_PAIRED' })
  })

  it('listens only on private-network addresses', () => {
    const interfaces = () => ({
      eth0: [
        { address: '192.168.1.20', family: 'IPv4' },
        { address: '203.0.113.7', family: 'IPv4' },
        { address: 'fe80::1', family: 'IPv6' },
        { address: '2001:db8::5', family: 'IPv6' },
      ],
      wg0: [{ address: 'fd00:8::2', family: 'IPv6' }, { address: '10.8.0.2', family: 'IPv4' }],
    }) as unknown as ReturnType<typeof import('node:os').networkInterfaces>
    expect(resolveBindHosts([], interfaces)).toEqual(['192.168.1.20', 'fd00:8::2', '10.8.0.2'])
    expect(resolveBindHosts(['10.8.0.2'], interfaces)).toEqual(['10.8.0.2'])
    expect(() => resolveBindHosts(['0.0.0.0'], interfaces)).toThrow(TypeError)
    expect(() => resolveBindHosts(['203.0.113.7'], interfaces)).toThrow(TypeError)
  })
})
