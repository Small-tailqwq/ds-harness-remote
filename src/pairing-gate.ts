import { generateLocalPairingCode, verifyLocalPairingProof } from './crypto/index.js'
import { uuidV7 } from './ids.js'
import { LOCAL_PAIRING_APPROVAL_MS, LOCAL_PAIRING_MAX_FAILURES, LOCAL_PAIRING_WINDOW_MS } from './protocol/index.js'

/** A phone that proved the pairing code and now waits for the person at the computer. */
export interface PairingRequest {
  id: string
  deviceId: string
  name: string
  platform: string
  fingerprint: string
  /** Source address of the pairing connection (private network only). */
  address: string
  /** Six digits the phone shows too. */
  confirmationCode: string
  requestedAt: number
  expiresAt: number
}

export interface PairingWindowView {
  code: string
  expiresAt: number
  request?: PairingRequest
}

export type PairingDecision = 'approved' | 'denied' | 'expired' | 'closed'

export type PairingProofResult =
  | { ok: true }
  | { ok: false; reason: 'closed' | 'rejected' }

interface OpenWindow {
  code: string
  expiresAt: number
  failures: number
  /** Set once a correct proof arrived: the code is spent, no second phone may use it. */
  claimed: boolean
  request?: PairingRequest
  settle?: (decision: PairingDecision) => void
  timer?: ReturnType<typeof setTimeout>
}

export interface PairingGateOptions {
  now?: () => number
  windowMs?: number
  approvalMs?: number
}

/**
 * The pairing window, held only in the running Host's memory. It opens from
 * the Desktop UI, carries one 128-bit code, accepts one correct proof, and
 * then waits for the person at the computer to approve that phone. Every
 * outcome — approval, denial, timeout, close — ends the window.
 */
export class PairingGate {
  private window?: OpenWindow
  private readonly listeners = new Set<() => void>()
  private readonly now: () => number
  private readonly windowMs: number
  private readonly approvalMs: number

  constructor(options: PairingGateOptions = {}) {
    this.now = options.now ?? Date.now
    this.windowMs = options.windowMs ?? LOCAL_PAIRING_WINDOW_MS
    this.approvalMs = options.approvalMs ?? LOCAL_PAIRING_APPROVAL_MS
  }

  /** Open a fresh window, replacing (and cancelling) any current one. */
  open(): PairingWindowView {
    this.end('closed', false)
    const window: OpenWindow = {
      code: generateLocalPairingCode(),
      expiresAt: this.now() + this.windowMs,
      failures: 0,
      claimed: false,
    }
    window.timer = setTimeout(() => this.expire(window), this.windowMs)
    window.timer.unref?.()
    this.window = window
    this.emit()
    return this.view(window)
  }

  close(): void {
    this.end('closed')
  }

  /** The open window, or undefined once it expired or ended. */
  current(): PairingWindowView | undefined {
    const window = this.live()
    return window === undefined ? undefined : this.view(window)
  }

  /** Whether a new pairing connection may start (open and not yet claimed). */
  accepting(): boolean {
    const window = this.live()
    return window !== undefined && !window.claimed
  }

  verifyProof(handshakeHash: Uint8Array, proof: string): PairingProofResult {
    const window = this.live()
    if (window === undefined || window.claimed) return { ok: false, reason: 'closed' }
    if (verifyLocalPairingProof(window.code, handshakeHash, proof)) {
      window.claimed = true
      return { ok: true }
    }
    window.failures += 1
    if (window.failures >= LOCAL_PAIRING_MAX_FAILURES) this.end('closed')
    return { ok: false, reason: 'rejected' }
  }

  /**
   * Hold the claimed window until the computer decides. `signal` aborts when
   * the phone goes away, which withdraws the request.
   */
  requestApproval(
    input: Omit<PairingRequest, 'id' | 'requestedAt' | 'expiresAt'>,
    signal?: AbortSignal,
  ): Promise<PairingDecision> {
    const window = this.live()
    if (window === undefined || !window.claimed || window.request !== undefined) return Promise.resolve('closed')
    const requestedAt = this.now()
    const request: PairingRequest = { ...input, id: uuidV7(requestedAt), requestedAt, expiresAt: requestedAt + this.approvalMs }
    return new Promise<PairingDecision>(resolve => {
      window.request = request
      window.settle = resolve
      if (window.timer !== undefined) clearTimeout(window.timer)
      window.timer = setTimeout(() => this.end('expired'), this.approvalMs)
      window.timer.unref?.()
      if (signal !== undefined) {
        if (signal.aborted) {
          this.end('closed')
          return
        }
        signal.addEventListener('abort', () => {
          if (this.window === window) this.end('closed')
        }, { once: true })
      }
      this.emit()
    })
  }

  /** The computer's answer; false when the request is no longer pending. */
  decide(requestId: string, approve: boolean): boolean {
    const window = this.live()
    if (window?.request?.id !== requestId) return false
    this.end(approve ? 'approved' : 'denied')
    return true
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  dispose(): void {
    this.end('closed', false)
    this.listeners.clear()
  }

  private live(): OpenWindow | undefined {
    const window = this.window
    if (window === undefined) return undefined
    // A pending request keeps its own deadline past the 5-minute code expiry.
    if (window.request === undefined && window.expiresAt <= this.now()) {
      this.end('expired')
      return undefined
    }
    return window
  }

  private expire(window: OpenWindow): void {
    if (this.window === window && window.request === undefined) this.end('expired')
  }

  private end(decision: PairingDecision, notify = true): void {
    const window = this.window
    if (window === undefined) return
    this.window = undefined
    if (window.timer !== undefined) clearTimeout(window.timer)
    window.settle?.(decision)
    if (notify) this.emit()
  }

  private view(window: OpenWindow): PairingWindowView {
    return {
      code: window.code,
      expiresAt: window.expiresAt,
      ...(window.request === undefined ? {} : { request: { ...window.request } }),
    }
  }

  private emit(): void {
    for (const listener of this.listeners) {
      try {
        listener()
      } catch {
        // A UI listener must not break pairing.
      }
    }
  }
}
