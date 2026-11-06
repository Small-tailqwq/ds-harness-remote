import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
  NoiseIkSession,
  createLocalNoisePrologue,
  createLocalPairingProof,
  createNoisePrologue,
  fromBase64Url,
  generateKeyPair,
  generateLocalPairingCode,
  toBase64Url,
  verifyLocalPairingProof,
} from '../src/crypto/index.js'

interface LocalVector {
  name: string
  staticKeys: Record<'initiator' | 'responder', { privateKey: string; publicKey: string }>
  ephemeralPrivateKeys: Record<'initiator' | 'responder', string>
  prologue: { connectionId: string; hostDeviceId: string; clientDeviceId: string; bytes: string }
  handshake: { message1: string; message2: string }
  handshakeHash: string
  transport: { sender: 'initiator'; plaintext: string; ciphertext: string }
  pairing: { code: string; proof: string }
}

const file = JSON.parse(await readFile(
  new URL('./fixture-local-v1/noise-ik.json', import.meta.url), 'utf8',
)) as { fixtureFormat: string; vectors: LocalVector[] }

describe('Local Direct crypto', () => {
  it.each(file.vectors)('$name matches deterministic handshake, hash and pairing proof', vector => {
    expect(file.fixtureFormat).toBe('dsh-remote.local-noise-vectors')
    const prologue = createLocalNoisePrologue(
      vector.prologue.connectionId, vector.prologue.hostDeviceId, vector.prologue.clientDeviceId,
    )
    expect(toBase64Url(prologue)).toBe(vector.prologue.bytes)
    const initiator = session('initiator', vector, prologue)
    const responder = session('responder', vector, prologue)

    const message1 = initiator.writeHandshake()
    expect(toBase64Url(message1)).toBe(vector.handshake.message1)
    responder.readHandshake(message1)
    const message2 = responder.writeHandshake()
    expect(toBase64Url(message2)).toBe(vector.handshake.message2)
    initiator.readHandshake(message2)

    expect(toBase64Url(initiator.handshakeHash())).toBe(vector.handshakeHash)
    expect(toBase64Url(responder.handshakeHash())).toBe(vector.handshakeHash)
    const ciphertext = initiator.encrypt(fromBase64Url(vector.transport.plaintext))
    expect(toBase64Url(ciphertext)).toBe(vector.transport.ciphertext)
    expect(createLocalPairingProof(vector.pairing.code, initiator.handshakeHash())).toBe(vector.pairing.proof)
    expect(verifyLocalPairingProof(vector.pairing.code, responder.handshakeHash(), vector.pairing.proof)).toBe(true)
  })

  it('does not accept an account prologue handshake on a Local Direct session', () => {
    const host = generateKeyPair()
    const client = generateKeyPair()
    const initiator = new NoiseIkSession({
      role: 'initiator', localPrivateKey: client.privateKey, localPublicKey: client.publicKey,
      remotePublicKey: host.publicKey, prologue: createNoisePrologue('c', 'h', 'd'),
    })
    const responder = new NoiseIkSession({
      role: 'responder', localPrivateKey: host.privateKey, localPublicKey: host.publicKey,
      remotePublicKey: client.publicKey, prologue: createLocalNoisePrologue('c', 'h', 'd'),
    })
    expect(() => responder.readHandshake(initiator.writeHandshake())).toThrow()
  })

  it('rejects pairing proofs bound to another handshake, code or encoding', () => {
    const vector = file.vectors[0]!
    const hash = fromBase64Url(vector.handshakeHash)
    const otherHash = Uint8Array.from(hash, (byte, index) => index === 0 ? byte ^ 1 : byte)
    const otherCode = generateLocalPairingCode()
    const cases: Array<[string, () => boolean]> = [
      ['other handshake', () => verifyLocalPairingProof(vector.pairing.code, otherHash, vector.pairing.proof)],
      ['other code', () => verifyLocalPairingProof(otherCode, hash, vector.pairing.proof)],
      ['truncated proof', () => verifyLocalPairingProof(vector.pairing.code, hash, vector.pairing.proof.slice(0, -2))],
      ['padded proof', () => verifyLocalPairingProof(vector.pairing.code, hash, `${vector.pairing.proof}=`)],
      ['empty proof', () => verifyLocalPairingProof(vector.pairing.code, hash, '')],
    ]
    const accepted = cases.filter(([, run]) => run()).map(([name]) => name)
    expect(accepted).toEqual([])
    expect(() => createLocalPairingProof('short', hash)).toThrow(TypeError)
    expect(fromBase64Url(generateLocalPairingCode()).byteLength).toBe(16)
  })
})

function session(role: 'initiator' | 'responder', vector: LocalVector, prologue: Uint8Array): NoiseIkSession {
  const local = vector.staticKeys[role]
  const remote = vector.staticKeys[role === 'initiator' ? 'responder' : 'initiator']
  const ephemeral = fromBase64Url(vector.ephemeralPrivateKeys[role])
  let offset = 0
  return new NoiseIkSession({
    role,
    localPrivateKey: local.privateKey,
    localPublicKey: local.publicKey,
    remotePublicKey: remote.publicKey,
    prologue,
    random: length => {
      const result = ephemeral.slice(offset, offset + length)
      offset += length
      return result
    },
  })
}
