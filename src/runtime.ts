import { createEvent, formatLocalPairingLink, LOCAL_MAX_ADDRESSES, parseLocalAddress } from './protocol/index.js'
import type { ResolvedConfig } from './config.js'
import { ConnectionController, type PeerTrust } from './connection-controller.js'
import { HarnessRemoteBridge, type NativeWorkspaceResolver } from './harness-remote-bridge.js'
import { harnessSessionGeneration } from './harness-version.js'
import type { HostIdentity } from './identity-store.js'
import { LocalDirectHost, type LocalDirectStatus } from './local-host.js'
import { LocalPairingStore } from './local-pairing.js'
import { PreferencesStore, type LangoPreferences } from './preferences.js'
import type { SafeLogger } from './logging.js'
import { PairingGate, type PairingRequest } from './pairing-gate.js'
import { RpcRouter } from './rpc-router.js'
import { TerminalPolicy } from './terminal-policy.js'
import type { LocalTypertGateway } from './typert-gateway-contract.js'
import { LANGO_VERSION } from './version.js'

const TRUST_POLL_MS = 3_000

/** Pairing trust that fails closed while the pairing file cannot be read. */
class GuardedTrust implements PeerTrust {
  available = true
  constructor(private readonly store: LocalPairingStore) {}
  isTrusted(deviceId: string, publicKey: string): boolean {
    return this.available && this.store.isTrusted(deviceId, publicKey)
  }
  hasDevice(deviceId: string): boolean {
    return this.store.hasDevice(deviceId)
  }
}

export interface LangoStatus extends LocalDirectStatus {
  pairedDevices: number
  connections: number
  harnessVersion?: string
  carrier: boolean
}

export interface LangoDeviceView {
  deviceId: string
  name: string
  platform: string
  fingerprint: string
  pairedAt: number
  lastSeenAt?: number
  online: boolean
  address?: string
  connectedAt?: number
  rttMs?: number
}

/** Everything the Desktop panel shows, in one snapshot. */
export interface LangoState {
  host: {
    name: string
    fingerprint: string
    listening: boolean
    addresses: string[]
    /** Addresses a phone can reach (no loopback), as carried by the QR code. */
    pairable: string[]
    error?: string
    terminal: boolean
    carrier: boolean
    harnessVersion?: string
  }
  /** Present only while a pairing window is open. */
  pairing?: {
    link: string
    expiresAt: number
    request?: PairingRequest
  }
  devices: LangoDeviceView[]
  preferences: LangoPreferences
}

export class LangoControlError extends Error {
  constructor(readonly code: string, message: string) { super(message) }
}

export interface LangoRuntimeOptions {
  now?: () => number
  approvalMs?: number
  /** Which listening addresses go into the QR code; tests include loopback. */
  pairableAddresses?: (addresses: readonly string[]) => string[]
}

/** Local Direct listener + official Typert Remote carrier, nothing else. */
export class LangoRuntime {
  readonly gate: PairingGate
  private readonly pairing: LocalPairingStore
  private readonly preferences: PreferencesStore
  private readonly trust: GuardedTrust
  private readonly connections: ConnectionController
  private readonly terminalOwners = new Map<string, string>()
  private readonly listeners = new Set<() => void>()
  private identity?: HostIdentity
  private host?: LocalDirectHost
  private trustTimer?: ReturnType<typeof setInterval>
  private closed = false
  private readonly pairable: (addresses: readonly string[]) => string[]

  constructor(
    private readonly config: ResolvedConfig,
    root: string,
    private readonly gateway: LocalTypertGateway,
    private readonly logger: SafeLogger,
    private readonly harnessVersion: string | undefined,
    options: LangoRuntimeOptions = {},
  ) {
    const now = options.now ?? Date.now
    this.pairable = options.pairableAddresses ?? pairableAddresses
    this.pairing = new LocalPairingStore(root, now)
    this.preferences = new PreferencesStore(this.pairing.directory)
    this.gate = new PairingGate({ now, ...(options.approvalMs === undefined ? {} : { approvalMs: options.approvalMs }) })
    this.gate.onChange(() => this.emit())
    this.trust = new GuardedTrust(this.pairing)
    this.connections = new ConnectionController(this.trust, (context, send) => {
      const peerGateway = this.gateway.createPeer?.() ?? this.gateway
      const bridge = peerGateway.supportsCarrier
        ? new HarnessRemoteBridge(
            peerGateway,
            (event, data) => send(createEvent(event, data)),
            this.logger,
            this.harnessVersion,
            new TerminalPolicy(() => this.config.terminal, context.peerDeviceId, this.terminalOwners),
            undefined,
            harnessWorkspaceResolver(peerGateway, () => harnessSessionGeneration(this.harnessVersion) === 'v3'),
          )
        : undefined
      return new RpcRouter(bridge, () => this.capabilities(), this.logger)
    }, this.logger)
    this.connections.onChange(() => this.emit())
  }

  async start(): Promise<void> {
    if (this.closed) throw new Error('lango runtime is closed')
    const identity = await this.pairing.loadIdentity(this.config.deviceName)
    this.identity = identity
    await this.preferences.load()
    this.logger.info('lango host identity ready', { fingerprint: identity.fingerprint })
    const host = new LocalDirectHost({
      config: this.config.local,
      identity,
      pairing: this.pairing,
      gate: this.gate,
      logger: this.logger,
      accept: async channel => {
        await this.connections.accept(channel)
        // "Last seen" means the end of the latest connection, so touch on both edges.
        void this.pairing.touch(channel.peerDeviceId).catch(() => undefined)
        channel.onClose?.(() => { void this.pairing.touch(channel.peerDeviceId).then(() => this.emit(), () => undefined) })
      },
      conflictsWithAccount: () => false,
      hostVersion: LANGO_VERSION,
    })
    this.host = host
    await host.start()
    this.trustTimer = setInterval(() => { void this.refreshTrust() }, TRUST_POLL_MS)
    this.trustTimer.unref?.()
    this.emit()
  }

  status(): LangoStatus {
    return {
      ...(this.host?.status() ?? { listening: false, addresses: [] }),
      pairedDevices: this.pairing.listPairedDevices().length,
      connections: this.connections.connectionCount(),
      ...(this.harnessVersion === undefined ? {} : { harnessVersion: this.harnessVersion }),
      carrier: this.gateway.supportsCarrier,
    }
  }

  /** Snapshot for the Desktop panel. The pairing link appears only while a window is open. */
  state(): LangoState {
    const status = this.host?.status() ?? { listening: false, addresses: [] }
    const pairable = this.pairable(status.addresses)
    const window = this.gate.current()
    const peers = new Map(this.connections.connectedPeers().map(peer => [peer.deviceId, peer]))
    const devices = this.pairing.listPairedDevices()
      .map((device): LangoDeviceView => {
        const peer = peers.get(device.deviceId)
        return {
          deviceId: device.deviceId,
          name: device.name,
          platform: device.platform,
          fingerprint: device.fingerprint,
          pairedAt: device.pairedAt,
          ...(device.lastSeenAt === undefined ? {} : { lastSeenAt: device.lastSeenAt }),
          online: peer !== undefined,
          ...(peer?.address === undefined ? {} : { address: peer.address }),
          ...(peer?.connectedAt === undefined ? {} : { connectedAt: peer.connectedAt }),
          ...(peer?.rttMs === undefined ? {} : { rttMs: peer.rttMs }),
        }
      })
      .sort((left, right) => Number(right.online) - Number(left.online)
        || (right.lastSeenAt ?? right.pairedAt) - (left.lastSeenAt ?? left.pairedAt))
    const identity = this.identity
    return {
      host: {
        name: identity?.name ?? this.config.deviceName,
        fingerprint: identity?.fingerprint ?? '',
        listening: status.listening,
        addresses: status.addresses,
        pairable,
        ...(status.error === undefined ? {} : { error: status.error }),
        terminal: this.config.terminal,
        carrier: this.gateway.supportsCarrier,
        ...(this.harnessVersion === undefined ? {} : { harnessVersion: this.harnessVersion }),
      },
      ...(window === undefined || identity === undefined || pairable.length === 0 ? {} : {
        pairing: {
          link: formatLocalPairingLink({
            hostDeviceId: identity.deviceId,
            hostIdentityKey: identity.publicKey,
            addresses: pairable,
            pairingCode: window.code,
            name: identity.name,
          }),
          expiresAt: window.expiresAt,
          ...(window.request === undefined ? {} : { request: window.request }),
        },
      }),
      devices,
      preferences: this.preferences.get(),
    }
  }

  async setPreferences(patch: Partial<LangoPreferences>): Promise<LangoState> {
    await this.preferences.update(patch)
    this.emit()
    return this.state()
  }

  openPairing(): LangoState {
    const status = this.host?.status()
    if (this.closed || this.identity === undefined || status?.listening !== true) {
      throw new LangoControlError('NOT_LISTENING', 'lango is not listening on any private address.')
    }
    if (this.pairable(status.addresses).length === 0) {
      throw new LangoControlError('NO_ADDRESS', 'No private address a phone can reach.')
    }
    this.gate.open()
    this.logger.info('lango pairing window opened')
    return this.state()
  }

  closePairing(): LangoState {
    this.gate.close()
    return this.state()
  }

  decidePairing(requestId: string, approve: boolean): LangoState {
    if (!this.gate.decide(requestId, approve)) {
      throw new LangoControlError('REQUEST_GONE', 'The pairing request is no longer waiting.')
    }
    this.logger.info('lango pairing decided', { approve })
    return this.state()
  }

  async revokeDevice(deviceId: string): Promise<LangoState> {
    if (!await this.pairing.revoke(deviceId)) throw new LangoControlError('DEVICE_NOT_FOUND', 'No paired device has that id.')
    await this.connections.revokeUntrustedLocal()
    this.logger.info('lango device revoked')
    this.emit()
    return this.state()
  }

  async renameDevice(deviceId: string, name: string): Promise<LangoState> {
    if (!await this.pairing.rename(deviceId, name)) throw new LangoControlError('DEVICE_NOT_FOUND', 'No paired device has that id.')
    this.emit()
    return this.state()
  }

  async measureDevice(deviceId: string): Promise<{ rttMs?: number; state: LangoState }> {
    const rttMs = await this.connections.measure(deviceId)
    this.emit()
    return { ...(rttMs === undefined ? {} : { rttMs }), state: this.state() }
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    if (this.trustTimer !== undefined) clearInterval(this.trustTimer)
    this.gate.dispose()
    await this.host?.stop()
    await this.connections.close()
    await this.pairing.flush()
    await this.preferences.flush()
    this.listeners.clear()
    this.logger.info('lango host stopped')
  }

  private emit(): void {
    for (const listener of this.listeners) {
      try {
        listener()
      } catch {
        // Panel listeners never affect the Host.
      }
    }
  }

  private capabilities(): string[] {
    if (!this.gateway.supportsCarrier) return []
    const capabilities = [
      harnessSessionGeneration(this.harnessVersion) === 'v3' ? 'harness.remote.v3' : 'harness.remote.v1',
      'harness.remote.transfer.v1',
    ]
    if (this.config.terminal) capabilities.push('harness.terminal.v1')
    return capabilities
  }

  private async refreshTrust(): Promise<void> {
    try {
      const changed = await this.pairing.reload()
      const recovered = !this.trust.available
      this.trust.available = true
      if (changed || recovered) {
        await this.connections.revokeUntrustedLocal()
        this.emit()
      }
    } catch (error) {
      // A damaged pairing file must not keep stale trust alive.
      this.trust.available = false
      await this.connections.revokeUntrustedLocal()
      this.emit()
      this.logger.warn('lango pairings could not be read', { reason: error instanceof Error ? error.message : 'unknown' })
    }
  }
}

/** Addresses a phone can reach, LAN first, then CGNAT (Tailscale), then IPv6 ULA; never loopback or link-local. */
export function pairableAddresses(addresses: readonly string[]): string[] {
  const rank = (address: string): number => {
    let host: string
    try {
      host = parseLocalAddress(address).host
    } catch {
      return -1
    }
    if (host.startsWith('127.') || host === '::1' || host.startsWith('169.254.') || host.startsWith('fe80:')) return -1
    if (host.startsWith('192.168.') || host.startsWith('10.') || /^172\.(1[6-9]|2\d|3[01])\./u.test(host)) return 0
    if (host.startsWith('100.')) return 1
    return 2
  }
  return addresses
    .map(address => ({ address, rank: rank(address) }))
    .filter(entry => entry.rank >= 0)
    .sort((left, right) => left.rank - right.rank)
    .slice(0, LOCAL_MAX_ADDRESSES)
    .map(entry => entry.address)
}

/** Session cwd from the official Gateway, filtered by the calling owner Peer; never from the Client. */
function harnessWorkspaceResolver(gateway: LocalTypertGateway, supportsSessions: () => boolean): NativeWorkspaceResolver {
  return async (sessionId, signal) => {
    signal.throwIfAborted()
    if (!gateway.supportsCarrier || !supportsSessions()) return undefined
    const result = await gateway.dispatch('session/list', { args: { _request: {} } }, signal)
    signal.throwIfAborted()
    const value = result.ok ? result.value as { items?: { sessionId?: string; cwd?: string }[] } | undefined : undefined
    return value?.items?.find(item => item.sessionId === sessionId)?.cwd
  }
}
