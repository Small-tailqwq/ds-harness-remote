import type { RemoteMessage } from './protocol/index.js'

export interface AuthenticatedPeerChannel {
  /**
   * Attestation supplied by the Noise/control-plane integration. Implementors
   * must expose this channel only after both the Noise IK transcript and the
   * Server membership for this exact connection have been verified.
   */
  readonly security: {
    protocol: 'Noise_IK_25519_ChaChaPoly_SHA256'
    connectionId: string
    membershipId: string
  }
  readonly peerDeviceId: string
  readonly peerIdentityKey: string
  readonly mode?: 'LAN' | 'P2P' | 'TURN' | 'Relay'
  /**
   * Which trust store authorizes the peer. Set by the Host code that built the
   * channel, never from wire data. Absent means the account (Server) store.
   */
  readonly trustScope?: 'account' | 'local'
  /** Source address of the authenticated socket, for display only. */
  readonly remoteAddress?: string
  readonly connectedAt?: number
  /** Latest measured round-trip time in milliseconds. */
  readonly rttMs?: number
  /** Measure the round-trip time now; undefined when the peer did not answer in time. */
  measureRtt?(): Promise<number | undefined>
  send(message: RemoteMessage): Promise<void>
  onMessage(handler: (message: RemoteMessage) => void): () => void
  /** Called once when the channel closes from either side. */
  onClose?(handler: () => void): () => void
  close(code?: string): Promise<void>
}
