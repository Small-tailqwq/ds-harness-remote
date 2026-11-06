import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'
import {
  NoiseIkSession,
  createLocalNoisePrologue,
  createLocalPairingProof,
  fromBase64Url,
  generateKeyPair,
  toBase64Url,
} from '../src/crypto/index.js'
import {
  LOCAL_DIRECT_PATH,
  createRpcRequest,
  decodeLocalControlFrame,
  decodeLocalPairFrame,
  decodeMessage,
  encodeLocalControlFrame,
  encodeLocalPairFrame,
  encodeMessage,
  type RemoteMessage,
} from '../src/protocol/index.js'
import { resolveConfig } from '../src/config.js'
import { uuidV7 } from '../src/ids.js'
import { LocalPairingStore } from '../src/local-pairing.js'
import { SafeLogger } from '../src/logging.js'
import { LangoRuntime } from '../src/runtime.js'
import type { LocalTypertGateway, TypertRpcResult } from '../src/typert-gateway-contract.js'

const logger = new SafeLogger({ debug() {}, info() {}, warn() {}, error() {} }, 'error')

interface Fixture {
  root: string
  runtime: LangoRuntime
  dispatch: ReturnType<typeof vi.fn>
  peersCreated: number
}

let fixture: Fixture

function fakeGateway(dispatch: LocalTypertGateway['dispatch'], onPeer: () => void): LocalTypertGateway {
  const base: LocalTypertGateway = {
    invoke: async () => undefined,
    dispatch,
    open: async () => { throw new Error('no streams in this test') },
    failure: () => ({ code: 'internal', message: 'failed', details: {} }),
    supportsCarrier: true,
  }
  return { ...base, createPeer: () => { onPeer(); return { ...base, peer: {} } } }
}

beforeEach(async () => {
  const root = await mkdtemp(join(tmpdir(), 'lango-runtime-'))
  const dispatch = vi.fn(async (endpoint: string): Promise<TypertRpcResult> => ({ ok: true, value: { endpoint, items: [] } }))
  const state = { root, dispatch, peersCreated: 0 } as Fixture
  const config = resolveConfig({ bind: ['127.0.0.1'], deviceName: 'Test Host' })
  config.local.port = 0
  state.runtime = new LangoRuntime(config, root, fakeGateway(dispatch, () => { state.peersCreated += 1 }), logger, '0.2.2-rc.1')
  await state.runtime.start()
  fixture = state
})

afterEach(async () => {
  await fixture.runtime.close()
  await rm(fixture.root, { recursive: true, force: true })
})

interface Session {
  ws: WebSocket
  noise: NoiseIkSession
  next(): Promise<Buffer>
}

/** A Client that knows only what the pairing link carries, as dsh-Go does. */
async function pairAndConnect(): Promise<Session> {
  // Same cross-process path as `lango pair`: a separate store on the same root.
  const cli = new LocalPairingStore(fixture.root)
  const listener = await cli.readListener()
  const window = await cli.openWindow()
  const keys = generateKeyPair()
  const deviceId = uuidV7()
  const ws = new WebSocket(`ws://${listener!.addresses[0]}${LOCAL_DIRECT_PATH}`)
  const frames: Buffer[] = []
  const waiters: Array<(frame: Buffer) => void> = []
  ws.on('message', (data: Buffer) => { const waiter = waiters.shift(); if (waiter) waiter(data); else frames.push(data) })
  const next = () => frames.length > 0 ? Promise.resolve(frames.shift()!) : new Promise<Buffer>(resolve => waiters.push(resolve))
  await new Promise(resolve => ws.once('open', resolve))
  ws.send(encodeLocalControlFrame({
    v: 1,
    type: 'local.hello',
    payload: { clientDeviceId: deviceId, clientIdentityKey: keys.publicKey, name: 'Phone', platform: 'dsh-app-android', capabilities: [], intent: 'pair' },
  }))
  const ack = decodeLocalControlFrame(await next())
  if (ack.type !== 'local.hello.ack') throw new Error(`unexpected ${ack.type}`)
  expect(ack.payload.hostIdentityKey).toBe(listener!.hostIdentityKey)
  expect(ack.payload.capabilities).toEqual([])
  const noise = new NoiseIkSession({
    role: 'initiator',
    localPrivateKey: keys.privateKey,
    localPublicKey: keys.publicKey,
    remotePublicKey: listener!.hostIdentityKey,
    prologue: createLocalNoisePrologue(ack.payload.connectionId, listener!.hostDeviceId, deviceId),
  })
  ws.send(encodeLocalControlFrame({ v: 1, type: 'secure.handshake', payload: { connectionId: ack.payload.connectionId, step: 1, data: toBase64Url(noise.writeHandshake()) } }))
  const step2 = decodeLocalControlFrame(await next())
  if (step2.type !== 'secure.handshake') throw new Error('no step 2')
  noise.readHandshake(fromBase64Url(step2.payload.data))
  ws.send(noise.encrypt(encodeLocalPairFrame({ v: 1, type: 'local.pair.prove', payload: { proof: createLocalPairingProof(window.code, noise.handshakeHash()) } })))
  expect(decodeLocalPairFrame(noise.decrypt(await next())).type).toBe('local.pair.ok')
  return { ws, noise, next }
}

async function rpc(session: Session, method: Parameters<typeof createRpcRequest>[0], params: unknown): Promise<RemoteMessage> {
  const request = createRpcRequest(method, params)
  session.ws.send(session.noise.encrypt(encodeMessage(request)))
  const response = decodeMessage(session.noise.decrypt(await session.next()))
  expect(response.payload).toMatchObject({ requestId: request.id })
  return response
}

describe('lango runtime', () => {
  it('serves a paired phone the Harness carrier and nothing beyond it', async () => {
    const session = await pairAndConnect()
    const describeResponse = await rpc(session, 'harness.transport.describe', {})
    expect(describeResponse.type).toBe('rpc.response')
    const capabilities = (describeResponse.payload as { result: { capabilities: string[] } }).result.capabilities
    expect(capabilities).toEqual(expect.arrayContaining([
      'harness.remote.v3',
      'harness.remote.transfer.v1',
      'harness.remote.stream.transfer.v1',
      'remote.history.compact.v1',
    ]))
    for (const absent of ['workspace.upload.v1', 'codex.appserver.v1', 'fileviewer.read.v1', 'agent.acp.v1']) {
      expect(capabilities).not.toContain(absent)
    }

    const call = await rpc(session, 'harness.remote.call', { endpoint: 'session/list', payload: { args: { _request: {} } } })
    expect(call.type).toBe('rpc.response')
    expect(fixture.dispatch).toHaveBeenCalledWith('session/list', { args: { _request: {} } }, expect.anything())
    // Each authenticated connection gets its own owner Peer.
    expect(fixture.peersCreated).toBe(1)

    const outside = await rpc(session, 'harness.remote.call', { endpoint: 'filesystem/write', payload: { args: {} } })
    expect(outside.type).toBe('rpc.error')
    const codex = await rpc(session, 'codex.app.call', { method: 'thread/list', params: {} })
    expect(codex.type).toBe('rpc.error')
    expect(codex.payload).toMatchObject({ code: 'METHOD_NOT_FOUND' })
    expect(fixture.dispatch).toHaveBeenCalledTimes(1)
    expect(fixture.runtime.status()).toMatchObject({ listening: true, pairedDevices: 1, connections: 1, carrier: true })
    session.ws.close()
  })
})
