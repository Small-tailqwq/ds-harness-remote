import type { TypertRpcResult } from './typert-gateway-contract.js'

/**
 * Seam kept from ds-harness-remote's Harness bridge. lango ships no CodeX
 * domain, so the bridge is always constructed without one.
 */
export interface CodexWorkspaceBridge {
  call(endpoint: string, payload: unknown, signal: AbortSignal): Promise<TypertRpcResult | undefined>
  open(endpoint: string, payload: unknown, signal: AbortSignal): Promise<AsyncIterable<unknown> | undefined>
  closeAll(): Promise<void>
}
