import { describe, expect, it } from 'vitest'
import {
  LOCAL_MAX_PREAUTH_FRAME_BYTES,
  decodeLocalControlFrame,
  decodeLocalPairFrame,
  encodeLocalControlFrame,
  encodeLocalPairFrame,
  formatLocalPairingLink,
  isPrivateNetworkAddress,
  parseLocalAddress,
  parseLocalPairingLink,
} from '../src/protocol/index.js'

const hostId = '0198f0c4-6d3a-7c11-8a2b-3c4d5e6f7a8b'
const clientId = '0198f0c4-6d3a-7c11-8a2b-3c4d5e6f7a8c'
const connectionId = '0198f0c4-6d3a-7c11-8a2b-3c4d5e6f7a8d'
const key = 'ST6C_HRGSlkmiBdiPSBTxeuOLMSpiLT-4XnsawENUx0'
const code = 'wMHCw8TFxsfIycrLzM3Ozw'

const hello = {
  v: 1, type: 'local.hello',
  payload: { clientDeviceId: clientId, clientIdentityKey: key, name: 'Pixel', platform: 'dsh-app-android', capabilities: ['harness.remote.v1'], intent: 'pair' },
} as const

describe('Local Direct control frames', () => {
  it('round-trips every pre-auth frame type', () => {
    const frames = [
      hello,
      { v: 1, type: 'local.hello.ack', payload: { hostDeviceId: hostId, hostIdentityKey: key, name: 'WORKSTATION', connectionId, capabilities: [] } },
      { v: 1, type: 'secure.handshake', payload: { connectionId, step: 1, data: 'AAAA' } },
      { v: 1, type: 'local.error', payload: { code: 'PEER_NOT_PAIRED', message: 'Pair this device first.' } },
    ] as const
    for (const frame of frames) expect(decodeLocalControlFrame(encodeLocalControlFrame(frame as Parameters<typeof encodeLocalControlFrame>[0]))).toEqual(frame)
  })

  it('rejects malformed or hostile pre-auth frames', () => {
    const cases: Array<[string, string]> = [
      ['unknown type', JSON.stringify({ ...hello, type: 'local.other' })],
      ['wrong version', JSON.stringify({ ...hello, v: 2 })],
      ['unknown field', JSON.stringify({ ...hello, payload: { ...hello.payload, token: 'x' } })],
      ['duplicate key', `{"v":1,"v":1,"type":"local.hello","payload":${JSON.stringify(hello.payload)}}`],
      ['bad device id', JSON.stringify({ ...hello, payload: { ...hello.payload, clientDeviceId: 'host\u0000' } })],
      ['non-canonical key', JSON.stringify({ ...hello, payload: { ...hello.payload, clientIdentityKey: `${key.slice(0, -1)}1` } })],
      ['control char name', JSON.stringify({ ...hello, payload: { ...hello.payload, name: 'a\nb' } })],
      ['bad intent', JSON.stringify({ ...hello, payload: { ...hello.payload, intent: 'admin' } })],
      ['handshake step 3', JSON.stringify({ v: 1, type: 'secure.handshake', payload: { connectionId, step: 3, data: 'AAAA' } })],
      ['oversized', JSON.stringify({ ...hello, payload: { ...hello.payload, name: 'x'.repeat(LOCAL_MAX_PREAUTH_FRAME_BYTES) } })],
    ]
    const accepted = cases.filter(([, raw]) => {
      try { decodeLocalControlFrame(raw); return true } catch { return false }
    }).map(([name]) => name)
    expect(accepted).toEqual([])
  })

  it('validates encrypted pairing frames', () => {
    const proof = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8'
    const prove = { v: 1, type: 'local.pair.prove', payload: { proof } } as const
    expect(decodeLocalPairFrame(encodeLocalPairFrame(prove))).toEqual(prove)
    expect(() => decodeLocalPairFrame(new TextEncoder().encode(JSON.stringify({ ...prove, payload: { proof: proof.slice(1) } })))).toThrow()
    expect(() => decodeLocalPairFrame(new TextEncoder().encode('{"v":1,"type":"rpc.request","payload":{}}'))).toThrow()
  })
})

describe('Local Direct pairing link and addresses', () => {
  it('round-trips a pairing link and normalizes addresses', () => {
    const link = { hostDeviceId: hostId, hostIdentityKey: key, addresses: ['192.168.1.10:47821', '[FD00::1]:47821'], pairingCode: code, name: '书房电脑' }
    const parsed = parseLocalPairingLink(formatLocalPairingLink(link))
    expect(parsed).toEqual({ ...link, addresses: ['192.168.1.10:47821', '[fd00::1]:47821'] })
  })

  it('rejects pairing links that could redirect or confuse a Client', () => {
    const good = formatLocalPairingLink({ hostDeviceId: hostId, hostIdentityKey: key, addresses: ['10.8.0.1:47821'], pairingCode: code })
    const cases: Array<[string, string]> = [
      ['other scheme', good.replace('dshremote:', 'https:')],
      ['other host', good.replace('local-pair', 'pair')],
      ['public address', good.replace('10.8.0.1', '8.8.8.8')],
      ['hostname address', good.replace('10.8.0.1', 'evil.example')],
      ['repeated field', `${good}&c=${code}`],
      ['unknown field', `${good}&server=https%3A%2F%2Fevil`],
      ['short code', good.replace(code, code.slice(2))],
      ['version 2', good.replace('v=1', 'v=2')],
      ['no address', good.replace(/a=[^&]+/u, 'a=')],
    ]
    const accepted = cases.filter(([, value]) => {
      try { parseLocalPairingLink(value); return true } catch { return false }
    }).map(([name]) => name)
    expect(accepted).toEqual([])
  })

  it('classifies private-network address literals', () => {
    const privateHosts = ['10.0.0.1', '172.16.5.4', '172.31.255.255', '192.168.1.1', '169.254.1.1', '100.64.0.1', '100.127.255.254', '127.0.0.1', '::1', 'fd12:3456::1', 'fc00::1', 'fe80::1', '::ffff:192.168.1.1']
    const publicHosts = ['8.8.8.8', '172.32.0.1', '100.128.0.1', '192.169.0.1', '2001:db8::1', '::ffff:8.8.8.8', '::', '01.2.3.4', '256.1.1.1', 'example.com']
    expect(privateHosts.filter(host => !isPrivateNetworkAddress(host))).toEqual([])
    expect(publicHosts.filter(host => isPrivateNetworkAddress(host))).toEqual([])
    expect(parseLocalAddress('[fe80::1]:1')).toEqual({ host: 'fe80::1', port: 1 })
    expect(() => parseLocalAddress('192.168.1.1:70000')).toThrow()
    expect(() => parseLocalAddress('192.168.1.1')).toThrow()
  })
})
