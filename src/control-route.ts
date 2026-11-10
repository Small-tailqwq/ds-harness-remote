// Portions derived from ds-harness-remote (https://github.com/liguobao/ds-harness-remote), MIT. See LICENSE.ds-harness-remote.
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http'
import { z } from 'zod'
import type { SafeLogger } from './logging.js'
import { LangoControlError, type LangoRuntime } from './runtime.js'

import { CONTROL_RPC_PREFIX, EVENTS_ENDPOINT } from './control-contract.js'

export { CONTROL_RPC_PREFIX, EVENTS_ENDPOINT }

const ENDPOINT_SEGMENT_PATTERN = /^[A-Za-z0-9_$.-]+$/
const MAX_BODY_BYTES = 16 * 1024
const KEEP_ALIVE_MS = 15_000
const PUSH_DEBOUNCE_MS = 80
const MAX_STREAMS = 16

export type ControlResult<T = unknown> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string; details: Record<string, unknown> } }

export type ControlRouteHandler = (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<ControlResult>

interface HostConnectionLike {
  requestRejection?(request: { headers: IncomingHttpHeaders }): number | undefined
  rpc?: {
    handle?(channel: string, handler: ControlRouteHandler, options: { authority: 'loopback' }): () => Promise<void>
  }
}

export interface HostWebServerLike {
  register(route: {
    kind: 'prefix'
    path: string
    handler(req: IncomingMessage, res: ServerResponse): void | Promise<void>
  }): () => void | Promise<void>
}

const deviceSchema = z.object({ deviceId: z.string().min(1).max(64) }).strict()
const renameSchema = z.object({ deviceId: z.string().min(1).max(64), name: z.string().trim().min(1).max(80) }).strict()
const decideSchema = z.object({ requestId: z.string().min(1).max(64), approve: z.boolean() }).strict()
const emptySchema = z.object({}).strict()
const preferencesSchema = z.object({ sidebarEntry: z.boolean().optional() }).strict()

/** Control endpoints the Desktop panel calls. Nothing here is reachable from a phone. */
export function createControlHandler(runtime: LangoRuntime): ControlRouteHandler {
  return async (endpoint, payload) => {
    try {
      switch (endpoint) {
        case 'state': emptySchema.parse(payload ?? {}); return ok(runtime.state())
        case 'pairing.open': emptySchema.parse(payload ?? {}); return ok(runtime.openPairing())
        case 'pairing.close': emptySchema.parse(payload ?? {}); return ok(runtime.closePairing())
        case 'pairing.decide': {
          const input = decideSchema.parse(payload)
          return ok(runtime.decidePairing(input.requestId, input.approve))
        }
        case 'device.revoke': return ok(await runtime.revokeDevice(deviceSchema.parse(payload).deviceId))
        case 'device.rename': {
          const input = renameSchema.parse(payload)
          return ok(await runtime.renameDevice(input.deviceId, input.name))
        }
        case 'preferences.set': {
          const input = preferencesSchema.parse(payload)
          return ok(await runtime.setPreferences(input.sidebarEntry === undefined ? {} : { sidebarEntry: input.sidebarEntry }))
        }
        case 'device.measure': return ok(await runtime.measureDevice(deviceSchema.parse(payload).deviceId))
        default: return failure('NOT_FOUND', 'Unknown lango control endpoint.')
      }
    } catch (error) {
      if (error instanceof LangoControlError) return failure(error.code, error.message)
      if (error instanceof z.ZodError) return failure('BAD_REQUEST', 'The request is invalid.')
      return failure('FAILED', 'The lango request failed.')
    }
  }
}

/** Pushes the full panel state on every change; a reconnecting panel gets it as its first frame. */
export class StateStream {
  private readonly responses = new Set<ServerResponse>()
  private timer?: ReturnType<typeof setTimeout>
  private keepAlive?: ReturnType<typeof setInterval>
  private readonly unsubscribe: () => void
  private closed = false

  constructor(private readonly runtime: LangoRuntime) {
    this.unsubscribe = runtime.onChange(() => this.schedule())
  }

  handle(res: ServerResponse): void {
    if (this.closed || this.responses.size >= MAX_STREAMS) {
      res.writeHead(503).end()
      return
    }
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' })
    res.write('retry: 3000\n\n')
    this.responses.add(res)
    this.write(res, this.frame())
    res.on('close', () => {
      this.responses.delete(res)
      if (this.responses.size === 0 && this.keepAlive !== undefined) {
        clearInterval(this.keepAlive)
        this.keepAlive = undefined
      }
    })
    if (this.keepAlive === undefined) {
      this.keepAlive = setInterval(() => { for (const response of this.responses) this.write(response, ': keep-alive\n\n') }, KEEP_ALIVE_MS)
      this.keepAlive.unref?.()
    }
  }

  close(): void {
    this.closed = true
    this.unsubscribe()
    if (this.timer !== undefined) clearTimeout(this.timer)
    if (this.keepAlive !== undefined) clearInterval(this.keepAlive)
    for (const response of this.responses) response.end()
    this.responses.clear()
  }

  private schedule(): void {
    if (this.closed || this.responses.size === 0 || this.timer !== undefined) return
    this.timer = setTimeout(() => {
      this.timer = undefined
      const frame = this.frame()
      for (const response of this.responses) this.write(response, frame)
    }, PUSH_DEBOUNCE_MS)
    this.timer.unref?.()
  }

  private frame(): string {
    return `data: ${JSON.stringify(this.runtime.state())}\n\n`
  }

  private write(res: ServerResponse, text: string): void {
    try {
      res.write(text)
    } catch {
      this.responses.delete(res)
    }
  }
}

/**
 * Mount the control route. With the Web server it sits behind the
 * Connection trust fence and additionally accepts only loopback sockets: the
 * pairing link and approvals belong to the person at this computer, not to a
 * browser reaching Desktop through a trusted host.
 */
export function registerControlRoute(
  connection: HostConnectionLike | undefined,
  webServer: HostWebServerLike | undefined,
  runtime: LangoRuntime,
  logger: SafeLogger,
): () => Promise<void> {
  const handler = createControlHandler(runtime)
  if (webServer !== undefined && connection?.requestRejection !== undefined) {
    const stream = new StateStream(runtime)
    const dispose = webServer.register({
      kind: 'prefix',
      path: CONTROL_RPC_PREFIX,
      handler: (req, res) => handleControlRequest(connection, handler, stream, req, res),
    })
    return async () => {
      stream.close()
      await dispose()
    }
  }
  const handle = connection?.rpc?.handle
  if (handle === undefined) {
    logger.warn('lango control route is unavailable; the Desktop panel cannot reach this Host')
    return async () => undefined
  }
  return handle.call(connection!.rpc, CONTROL_RPC_PREFIX, handler, { authority: 'loopback' })
}

async function handleControlRequest(
  connection: HostConnectionLike,
  handler: ControlRouteHandler,
  stream: StateStream,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const rejection = connection.requestRejection?.(req)
  if (rejection !== undefined) {
    writeText(res, rejection, rejection === 401 ? 'unauthorized' : 'forbidden')
    return
  }
  if (!isLoopback(req.socket.remoteAddress)) {
    writeText(res, 403, 'forbidden')
    return
  }
  const endpoint = endpointFromPath(new URL(req.url ?? '/', 'http://dsh.internal').pathname)
  if (req.method === 'GET' && endpoint === EVENTS_ENDPOINT) {
    stream.handle(res)
    return
  }
  if (req.method !== 'POST' || endpoint === undefined) {
    writeText(res, 404, 'not found')
    return
  }
  if (contentType(req.headers) !== 'application/json') {
    writeText(res, 415, 'content type must be application/json')
    return
  }
  let body: unknown
  try {
    body = await readJsonBody(req)
  } catch {
    writeText(res, 400, 'body is not JSON')
    return
  }
  const message = clientRequest(body)
  if (message === undefined || message.method !== endpoint) {
    writeJson(res, { type: 'server-response', rpcId: rpcId(body), result: failure('BAD_REQUEST', 'invalid client-request message') })
    return
  }
  const abort = new AbortController()
  req.on('close', () => { if (!req.complete) abort.abort() })
  try {
    writeJson(res, { type: 'server-response', rpcId: message.rpcId, result: await handler(endpoint, message.payload, abort.signal) })
  } catch {
    writeText(res, 500, 'handler failure')
  }
}

export function isLoopback(address: string | undefined): boolean {
  if (address === undefined) return false
  const lower = address.toLowerCase().replace(/^::ffff:/u, '')
  return lower === '::1' || lower.startsWith('127.')
}

function endpointFromPath(pathname: string): string | undefined {
  if (!pathname.startsWith(`${CONTROL_RPC_PREFIX}/`)) return undefined
  const endpoint = pathname.slice(CONTROL_RPC_PREFIX.length + 1)
  if (endpoint === '' || endpoint.includes('/') || !ENDPOINT_SEGMENT_PATTERN.test(endpoint) || endpoint === '.' || endpoint === '..') return undefined
  return endpoint
}

function contentType(headers: IncomingHttpHeaders): string | undefined {
  const raw = headers['content-type']
  const value = Array.isArray(raw) ? raw[0] : raw
  return value?.split(';', 1)[0]?.trim().toLowerCase()
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.byteLength
    if (size > MAX_BODY_BYTES) throw new Error('body too large')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function clientRequest(value: unknown): { rpcId: string; method: string; payload: unknown } | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (record.type !== 'client-request' || typeof record.rpcId !== 'string' || typeof record.method !== 'string') return undefined
  return { rpcId: record.rpcId, method: record.method, payload: record.payload }
}

function rpcId(value: unknown): string {
  const id = typeof value === 'object' && value !== null ? (value as Record<string, unknown>).rpcId : undefined
  return typeof id === 'string' ? id : 'invalid-request'
}

function ok<T>(value: T): ControlResult<T> {
  return { ok: true, value }
}

function failure(code: string, message: string): ControlResult<never> {
  return { ok: false, error: { code, message, details: {} } }
}

function writeJson(res: ServerResponse, body: unknown): void {
  res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

function writeText(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status)
  res.end(body)
}
