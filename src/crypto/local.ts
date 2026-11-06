import { randomBytes } from '@noble/ciphers/webcrypto'
import { hmac } from '@noble/hashes/hmac'
import { sha256 } from '@noble/hashes/sha256'
import { fromBase64Url, toBase64Url } from './index.js'

/** 128-bit pairing secret carried only in the Host's pairing QR code. */
export const LOCAL_PAIRING_CODE_BYTES = 16

const PROOF_LABEL = new TextEncoder().encode('DSH-REMOTE-LOCAL\0pair-proof\0v=1\0')

export function generateLocalPairingCode(random: (length: number) => Uint8Array = randomBytes): string {
  const code = random(LOCAL_PAIRING_CODE_BYTES)
  if (code.byteLength !== LOCAL_PAIRING_CODE_BYTES) throw new Error('Pairing code randomness has the wrong length.')
  return toBase64Url(code)
}

/**
 * Proof that the Client knows the pairing code, bound to one Noise handshake so
 * it cannot be replayed on another connection. The code itself never leaves
 * the Client.
 */
export function createLocalPairingProof(pairingCode: string, handshakeHash: Uint8Array): string {
  const key = requirePairingCode(pairingCode)
  try {
    return toBase64Url(hmac(sha256, key, concat(PROOF_LABEL, handshakeHash)))
  } finally {
    key.fill(0)
  }
}

export function verifyLocalPairingProof(pairingCode: string, handshakeHash: Uint8Array, proof: string): boolean {
  let actual: Uint8Array
  try {
    actual = fromBase64Url(proof)
  } catch {
    return false
  }
  if (actual.byteLength !== 32 || toBase64Url(actual) !== proof) return false
  const expected = fromBase64Url(createLocalPairingProof(pairingCode, handshakeHash))
  let different = 0
  for (let index = 0; index < expected.byteLength; index += 1) different |= expected[index]! ^ actual[index]!
  return different === 0
}

function requirePairingCode(value: string): Uint8Array {
  let bytes: Uint8Array
  try {
    bytes = fromBase64Url(value)
  } catch {
    throw new TypeError('Pairing code must be 16 bytes of canonical base64url.')
  }
  if (bytes.byteLength !== LOCAL_PAIRING_CODE_BYTES || toBase64Url(bytes) !== value) {
    throw new TypeError('Pairing code must be 16 bytes of canonical base64url.')
  }
  return bytes
}

function concat(left: Uint8Array, right: Uint8Array): Uint8Array {
  const output = new Uint8Array(left.byteLength + right.byteLength)
  output.set(left, 0)
  output.set(right, left.byteLength)
  return output
}
