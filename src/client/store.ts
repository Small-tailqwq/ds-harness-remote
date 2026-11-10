import type { LangoState } from '../runtime.js'

export type { LangoDeviceView, LangoState } from '../runtime.js'
export type { PairingRequest } from '../pairing-gate.js'

export type Control = <T = LangoState>(endpoint: string, payload?: unknown) => Promise<T>

export interface StateFeed {
  getSnapshot(): FeedSnapshot
  subscribe(listener: () => void): () => void
  /** Apply a state a control call already returned, without waiting for the push. */
  publish(state: LangoState): void
  close(): void
}

export type FeedSnapshot =
  | { phase: 'loading' }
  | { phase: 'ready'; state: LangoState }
  | { phase: 'unavailable' }

const POLL_MS = 2_000
const STREAM_SILENCE_MS = 4_000

/**
 * One state feed per page: an EventSource on the Host's push route, degrading
 * to polling `state` when the stream is unavailable. It runs only while
 * something is subscribed.
 */
export function createStateFeed(eventsUrl: string, control: Control): StateFeed {
  let snapshot: FeedSnapshot = { phase: 'loading' }
  const listeners = new Set<() => void>()
  let source: EventSource | undefined
  let poll: ReturnType<typeof setInterval> | undefined
  let silence: ReturnType<typeof setTimeout> | undefined

  const set = (next: FeedSnapshot): void => {
    snapshot = next
    for (const listener of listeners) listener()
  }
  const read = (): void => {
    control('state').then(state => set({ phase: 'ready', state }), () => {
      if (snapshot.phase !== 'ready') set({ phase: 'unavailable' })
    })
  }
  const startPolling = (): void => {
    source?.close()
    source = undefined
    if (poll !== undefined) return
    read()
    poll = setInterval(read, POLL_MS)
  }
  const start = (): void => {
    if (typeof EventSource !== 'function') {
      startPolling()
      return
    }
    try {
      source = new EventSource(eventsUrl)
    } catch {
      startPolling()
      return
    }
    silence = setTimeout(startPolling, STREAM_SILENCE_MS)
    source.onmessage = event => {
      if (silence !== undefined) {
        clearTimeout(silence)
        silence = undefined
      }
      try {
        set({ phase: 'ready', state: JSON.parse(String(event.data)) as LangoState })
      } catch {
        // Ignore a malformed frame; the next push replaces it.
      }
    }
    source.onerror = () => {
      if (source?.readyState === 2) startPolling()
    }
  }
  const stop = (): void => {
    source?.close()
    source = undefined
    if (poll !== undefined) clearInterval(poll)
    poll = undefined
    if (silence !== undefined) clearTimeout(silence)
    silence = undefined
  }

  return {
    getSnapshot: () => snapshot,
    subscribe: listener => {
      listeners.add(listener)
      if (listeners.size === 1) start()
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) stop()
      }
    },
    publish: state => set({ phase: 'ready', state }),
    close: () => {
      listeners.clear()
      stop()
    },
  }
}
