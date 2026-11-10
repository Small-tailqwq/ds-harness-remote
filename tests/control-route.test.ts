import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config.js'
import { isLoopback, registerControlRoute } from '../src/control-route.js'
import { SafeLogger } from '../src/logging.js'
import { LangoRuntime } from '../src/runtime.js'

const logger = new SafeLogger({ debug() {}, info() {}, warn() {}, error() {} }, 'error')

let root: string
let runtime: LangoRuntime
let server: Server
let base: string
let rejection: number | undefined
let dispose: () => Promise<void>

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'lango-route-'))
  const config = resolveConfig({ bind: ['127.0.0.1'], deviceName: 'Route Host' })
  config.local.port = 0
  runtime = new LangoRuntime(config, root, {
    invoke: async () => undefined,
    dispatch: async () => ({ ok: true, value: {} }),
    open: async () => { throw new Error('unused') },
    failure: () => ({ code: 'internal', message: 'failed', details: {} }),
    supportsCarrier: true,
  }, logger, '0.2.2-rc.1', { pairableAddresses: addresses => [...addresses] })
  await runtime.start()
  let handler: ((req: IncomingMessage, res: ServerResponse) => void | Promise<void>) | undefined
  rejection = undefined
  dispose = registerControlRoute(
    { requestRejection: () => rejection },
    { register: route => { handler = route.handler; return () => undefined } },
    runtime,
    logger,
  )
  server = createServer((req, res) => { void handler!(req, res) })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/dsh-lango`
})

afterEach(async () => {
  await dispose()
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
  await runtime.close()
  await rm(root, { recursive: true, force: true })
})

function call(endpoint: string, payload: unknown = {}): Promise<Response> {
  return fetch(`${base}/${endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: 'r1', method: endpoint, payload }),
  })
}

describe('lango control route', () => {
  it('serves the Desktop panel the client-request envelope', async () => {
    const response = await call('pairing.open')
    expect(response.status).toBe(200)
    const body = await response.json() as { rpcId: string; result: { ok: boolean; value: { pairing?: { link: string } } } }
    expect(body.rpcId).toBe('r1')
    expect(body.result.ok).toBe(true)
    expect(body.result.value.pairing?.link).toMatch(/^dshremote:\/\/local-pair\?/u)
  })

  it('keeps the sidebar entry off until switched on, across restarts', async () => {
    const read = async (endpoint: string, payload: unknown = {}) =>
      ((await (await call(endpoint, payload)).json()) as { result: { value: { preferences: { sidebarEntry: boolean } } } }).result.value
    expect((await read('state')).preferences).toEqual({ sidebarEntry: false })
    expect((await read('preferences.set', { sidebarEntry: true })).preferences).toEqual({ sidebarEntry: true })
    const config = resolveConfig({ bind: ['127.0.0.1'], deviceName: 'Route Host' })
    config.local.port = 0
    const restarted = new LangoRuntime(config, root, {
      invoke: async () => undefined,
      dispatch: async () => ({ ok: true, value: {} }),
      open: async () => { throw new Error('unused') },
      failure: () => ({ code: 'internal', message: 'failed', details: {} }),
      supportsCarrier: true,
    }, logger, '0.2.2-rc.1')
    await restarted.start()
    expect(restarted.state().preferences).toEqual({ sidebarEntry: true })
    await restarted.close()
    expect(((await (await call('preferences.set', { sidebarEntry: 'yes' })).json()) as { result: { ok: boolean } }).result.ok).toBe(false)
  })

  it('pushes state over the event stream', async () => {
    const controller = new AbortController()
    const response = await fetch(`${base}/events`, { signal: controller.signal })
    expect(response.headers.get('content-type')).toBe('text/event-stream')
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let text = ''
    const readUntil = async (pattern: RegExp): Promise<void> => {
      while (!pattern.test(text)) text += decoder.decode((await reader.read()).value)
    }
    await readUntil(/data: .*"devices"/u)
    expect(text).not.toContain('"pairing"')
    await call('pairing.open')
    await readUntil(/"pairing":\{"link"/u)
    controller.abort()
  })

  it('stays behind the Connection trust fence', async () => {
    rejection = 401
    expect((await call('state')).status).toBe(401)
    rejection = 403
    expect((await fetch(`${base}/events`)).status).toBe(403)
  })

  it('accepts only loopback sockets', () => {
    expect(isLoopback('127.0.0.1')).toBe(true)
    expect(isLoopback('::ffff:127.0.0.1')).toBe(true)
    expect(isLoopback('::1')).toBe(true)
    expect(isLoopback('192.168.1.20')).toBe(false)
    expect(isLoopback('100.64.0.2')).toBe(false)
    expect(isLoopback(undefined)).toBe(false)
  })
})
