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
  LOCAL_PAIR_APPROVAL_CAPABILITY,
  parseLocalPairingLink,
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
import { createControlHandler, type ControlResult } from '../src/control-route.js'
import { SafeLogger } from '../src/logging.js'
import { LangoRuntime, pairableAddresses, type LangoState } from '../src/runtime.js'
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
  state.runtime = new LangoRuntime(config, root, fakeGateway(dispatch, () => { state.peersCreated += 1 }), logger, '0.2.2-rc.1', {
    // The test listens on loopback only; a real QR code never carries it.
    pairableAddresses: addresses => [...addresses],
  })
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

async function control<T = LangoState>(endpoint: string, payload: unknown = {}): Promise<T> {
  const result = await createControlHandler(fixture.runtime)(endpoint, payload, new AbortController().signal) as ControlResult<T>
  if (!result.ok) throw Object.assign(new Error(result.error.message), { code: result.error.code })
  return result.value
}

/** A Client that knows only what the QR code carries, as dsh-Go does; the panel approves it. */
async function pairAndConnect(): Promise<Session> {
  const opened = await control('pairing.open')
  const link = parseLocalPairingLink(opened.pairing!.link)
  const keys = generateKeyPair()
  const deviceId = uuidV7()
  const ws = new WebSocket(`ws://${link.addresses[0]}${LOCAL_DIRECT_PATH}`)
  const frames: Buffer[] = []
  const waiters: Array<(frame: Buffer) => void> = []
  ws.on('message', (data: Buffer) => { const waiter = waiters.shift(); if (waiter) waiter(data); else frames.push(data) })
  const next = () => frames.length > 0 ? Promise.resolve(frames.shift()!) : new Promise<Buffer>(resolve => waiters.push(resolve))
  await new Promise(resolve => ws.once('open', resolve))
  ws.send(encodeLocalControlFrame({
    v: 1,
    type: 'local.hello',
    payload: { clientDeviceId: deviceId, clientIdentityKey: keys.publicKey, name: 'Phone', platform: 'dsh-app-android', capabilities: [LOCAL_PAIR_APPROVAL_CAPABILITY], intent: 'pair' },
  }))
  const ack = decodeLocalControlFrame(await next())
  if (ack.type !== 'local.hello.ack') throw new Error(`unexpected ${ack.type}`)
  expect(ack.payload.hostIdentityKey).toBe(link.hostIdentityKey)
  expect(ack.payload.capabilities).toEqual([])
  const noise = new NoiseIkSession({
    role: 'initiator',
    localPrivateKey: keys.privateKey,
    localPublicKey: keys.publicKey,
    remotePublicKey: link.hostIdentityKey,
    prologue: createLocalNoisePrologue(ack.payload.connectionId, link.hostDeviceId, deviceId),
  })
  ws.send(encodeLocalControlFrame({ v: 1, type: 'secure.handshake', payload: { connectionId: ack.payload.connectionId, step: 1, data: toBase64Url(noise.writeHandshake()) } }))
  const step2 = decodeLocalControlFrame(await next())
  if (step2.type !== 'secure.handshake') throw new Error('no step 2')
  noise.readHandshake(fromBase64Url(step2.payload.data))
  ws.send(noise.encrypt(encodeLocalPairFrame({ v: 1, type: 'local.pair.prove', payload: { proof: createLocalPairingProof(link.pairingCode, noise.handshakeHash()) } })))
  expect(decodeLocalPairFrame(noise.decrypt(await next())).type).toBe('local.pair.pending')
  const waiting = await control('state')
  expect(waiting.pairing?.request).toMatchObject({ deviceId, name: 'Phone', confirmationCode: expect.stringMatching(/^\d{6}$/u) })
  const approved = await control('pairing.decide', { requestId: waiting.pairing!.request!.id, approve: true })
  expect(approved.pairing).toBeUndefined()
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

  it('manages devices from the panel and measures their latency', async () => {
    const session = await pairAndConnect()
    const ping = await rpc(session, 'harness.transport.ping', {})
    expect(ping.payload).toMatchObject({ result: {} })
    await vi.waitFor(async () => expect((await control('state')).devices[0]?.online).toBe(true))
    const [device] = (await control('state')).devices
    expect(device).toMatchObject({ name: 'Phone', platform: 'dsh-app-android', online: true, address: '127.0.0.1' })
    const measured = await control<{ rttMs?: number; state: LangoState }>('device.measure', { deviceId: device!.deviceId })
    expect(measured.rttMs).toBeTypeOf('number')
    expect(measured.state.devices[0]?.rttMs).toBe(measured.rttMs)
    expect((await control('device.rename', { deviceId: device!.deviceId, name: 'Pixel' })).devices[0]?.name).toBe('Pixel')
    const closed = new Promise(resolve => session.ws.once('close', resolve))
    expect((await control('device.revoke', { deviceId: device!.deviceId })).devices).toEqual([])
    await closed
    await expect(control('device.revoke', { deviceId: device!.deviceId })).rejects.toMatchObject({ code: 'DEVICE_NOT_FOUND' })
    await expect(control('pairing.decide', { requestId: 'gone', approve: true })).rejects.toMatchObject({ code: 'REQUEST_GONE' })
    await expect(control('pairing.open', { extra: 1 })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('never puts loopback or link-local addresses into the QR code', () => {
    expect(pairableAddresses(['127.0.0.1:47821', '[fd7a:115c::1]:47821', '100.101.1.2:47821', '192.168.1.5:47821', '169.254.3.3:47821']))
      .toEqual(['192.168.1.5:47821', '100.101.1.2:47821', '[fd7a:115c::1]:47821'])
  })
})
