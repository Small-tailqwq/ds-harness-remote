import { createEvent } from './protocol/index.js'
import type { ResolvedConfig } from './config.js'
import { ConnectionController, type PeerTrust } from './connection-controller.js'
import { HarnessRemoteBridge, type NativeWorkspaceResolver } from './harness-remote-bridge.js'
import { harnessSessionGeneration } from './harness-version.js'
import { LocalDirectHost, type LocalDirectStatus } from './local-host.js'
import { LocalPairingStore } from './local-pairing.js'
import type { SafeLogger } from './logging.js'
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

/** Local Direct listener + official Typert Remote carrier, nothing else. */
export class LangoRuntime {
  private readonly pairing: LocalPairingStore
  private readonly trust: GuardedTrust
  private readonly connections: ConnectionController
  private readonly terminalOwners = new Map<string, string>()
  private host?: LocalDirectHost
  private trustTimer?: ReturnType<typeof setInterval>
  private closed = false

  constructor(
    private readonly config: ResolvedConfig,
    root: string,
    private readonly gateway: LocalTypertGateway,
    private readonly logger: SafeLogger,
    private readonly harnessVersion: string | undefined,
  ) {
    this.pairing = new LocalPairingStore(root)
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
  }

  async start(): Promise<void> {
    if (this.closed) throw new Error('lango runtime is closed')
    const identity = await this.pairing.loadIdentity(this.config.deviceName)
    this.logger.info('lango host identity ready', { fingerprint: identity.fingerprint })
    const host = new LocalDirectHost({
      config: this.config.local,
      identity,
      pairing: this.pairing,
      logger: this.logger,
      accept: channel => this.connections.accept(channel),
      conflictsWithAccount: () => false,
      hostVersion: LANGO_VERSION,
    })
    this.host = host
    await host.start()
    this.trustTimer = setInterval(() => { void this.refreshTrust() }, TRUST_POLL_MS)
    this.trustTimer.unref?.()
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

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    if (this.trustTimer !== undefined) clearInterval(this.trustTimer)
    await this.host?.stop()
    await this.connections.close()
    this.logger.info('lango host stopped')
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
      if (changed || recovered) await this.connections.revokeUntrustedLocal()
    } catch (error) {
      // A damaged pairing file must not keep stale trust alive.
      this.trust.available = false
      await this.connections.revokeUntrustedLocal()
      this.logger.warn('lango pairings could not be read', { reason: error instanceof Error ? error.message : 'unknown' })
    }
  }
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
