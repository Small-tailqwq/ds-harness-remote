import {
  createRpcError,
  createRpcResponse,
  type RemoteMessage,
  type RpcErrorPayload,
  type RpcRequestPayload,
} from './protocol/index.js'
import { z } from 'zod'
import type { HarnessRemoteBridge } from './harness-remote-bridge.js'
import type { SafeLogger } from './logging.js'
import { RpcError, safeErrorCode } from './safe-error.js'

export { RpcError } from './safe-error.js'

const wireRequestSchema = z.object({ method: z.string().min(1), params: z.unknown() }).strict()
const emptyParamsSchema = z.object({}).strict()
const historyConfigureSchema = z.object({ compact: z.boolean() }).strict()

/**
 * The ds-harness-remote Host methods lango serves: capability discovery, the
 * compact-history switch and the official Typert Remote carrier. CodeX, ACP,
 * file viewer, loopback, plugin routes and workspace upload stay with Remote.
 */
const apiMethods = new Set([
  'harness.transport.describe',
  'remote.history.configure',
  'harness.remote.call',
  'harness.remote.transfer.open',
  'harness.remote.transfer.chunk',
  'harness.remote.transfer.commit',
  'harness.remote.transfer.read',
  'harness.remote.transfer.close',
  'harness.remote.stream.open',
  'harness.remote.stream.close',
])

export class RpcRouter {
  private active = 0

  constructor(
    private readonly harnessRemote: HarnessRemoteBridge | undefined,
    private readonly capabilities: () => readonly string[],
    private readonly logger?: SafeLogger,
    private readonly maxPending = 128,
  ) {}

  async closePeerStreams(): Promise<void> {
    await this.harnessRemote?.closeAll()
  }

  async handle(message: RemoteMessage): Promise<RemoteMessage> {
    if (message.type !== 'rpc.request') {
      return createRpcError(message.id, 'INVALID_MESSAGE', 'Only RPC requests are accepted on the Host business channel.')
    }
    const parsedPayload = wireRequestSchema.safeParse(message.payload)
    if (!parsedPayload.success) return createRpcError(message.id, 'INVALID_MESSAGE', 'The RPC request payload is invalid.')
    if (!apiMethods.has(parsedPayload.data.method)) {
      return createRpcError(message.id, 'METHOD_NOT_FOUND', 'The requested method does not exist.')
    }
    const request = message as RemoteMessage<RpcRequestPayload>
    if (this.active >= this.maxPending) {
      return createRpcError(request.id, 'RATE_LIMITED', 'Too many Host requests are already pending.', undefined, true)
    }
    this.active += 1
    const startedAt = performance.now()
    try {
      const result = await this.invoke(request.payload.method, request.payload.params)
      this.logger?.debug('host rpc ok', {
        method: request.payload.method,
        durationMs: Math.round(performance.now() - startedAt),
      })
      return createRpcResponse(request.id, result)
    } catch (error: unknown) {
      const response = errorResponse(request.id, error)
      const params = request.payload.params as Record<string, unknown> | undefined
      this.logger?.warn('host rpc failed', {
        method: request.payload.method,
        ...(typeof params?.endpoint === 'string' ? { endpoint: params.endpoint } : {}),
        durationMs: Math.round(performance.now() - startedAt),
        code: response.payload.code,
        retryable: response.payload.retryable,
      })
      return response
    } finally {
      this.active -= 1
    }
  }

  private invoke(method: string, params: unknown): Promise<unknown> | unknown {
    switch (method) {
      case 'harness.transport.describe': {
        emptyParamsSchema.parse(params)
        const capabilities = [...new Set([
          ...this.capabilities(),
          'remote.history.compact.v1',
          ...(this.harnessRemote === undefined ? [] : ['harness.remote.stream.transfer.v1']),
        ])]
        return { capabilities }
      }
      case 'remote.history.configure': {
        const { compact } = historyConfigureSchema.parse(params)
        if (this.harnessRemote !== undefined) this.harnessRemote.compactHistoryEnabled = compact
        return { compact }
      }
      case 'harness.remote.call': return this.bridge().call(params)
      case 'harness.remote.transfer.open': return this.bridge().openTransfer(params)
      case 'harness.remote.transfer.chunk': return this.bridge().appendTransfer(params)
      case 'harness.remote.transfer.commit': return this.bridge().commitTransfer(params)
      case 'harness.remote.transfer.read': return this.bridge().readTransfer(params)
      case 'harness.remote.transfer.close': return this.bridge().closeTransfer(params)
      case 'harness.remote.stream.open': return this.bridge().openStream(params)
      case 'harness.remote.stream.close': return this.bridge().closeStream(params)
      default: throw new RpcError('METHOD_NOT_FOUND', 'The requested method does not exist.')
    }
  }

  private bridge(): HarnessRemoteBridge {
    if (this.harnessRemote === undefined) {
      throw new RpcError('FEATURE_NOT_SUPPORTED', 'This Harness version does not provide the Remote Gateway transport.')
    }
    return this.harnessRemote
  }
}

function errorResponse(requestId: string, error: unknown): RemoteMessage<RpcErrorPayload> {
  const code = safeErrorCode(error)
  if (error instanceof RpcError) return createRpcError(requestId, code, error.message, error.details, error.retryable)
  return createRpcError(
    requestId,
    code,
    code === 'INVALID_MESSAGE' ? 'The RPC parameters are invalid.' : 'The Host could not complete the request.',
  )
}
