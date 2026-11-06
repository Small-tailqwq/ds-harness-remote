import { z } from 'zod'
import { parseWireJson } from './wire-json.js'

/**
 * Local Direct: Host/Client connections over a private network without a
 * Remote Server. See docs/design/local-direct.md and docs/protocol.md.
 */
export const LOCAL_DIRECT_VERSION = 1
export const LOCAL_DIRECT_PATH = '/dsh-remote/local/v1'
export const LOCAL_DIRECT_DEFAULT_PORT = 47821
export const LOCAL_PAIRING_URI_SCHEME = 'dshremote:'
export const LOCAL_PAIRING_URI_HOST = 'local-pair'
/** A pairing window and its one-time code expire together. */
export const LOCAL_PAIRING_WINDOW_MS = 5 * 60_000
/** Wrong proofs allowed per pairing window before the window is closed. */
export const LOCAL_PAIRING_MAX_FAILURES = 5
/** Time an unauthenticated socket has to complete hello, handshake and (when pairing) proof. */
export const LOCAL_PREAUTH_TIMEOUT_MS = 10_000
/** Frames before the secure channel is ready are small; anything larger is hostile. */
export const LOCAL_MAX_PREAUTH_FRAME_BYTES = 8 * 1024
/** Noise transport message limit (65,535 bytes, including the AEAD tag). */
export const LOCAL_MAX_TRANSPORT_FRAME_BYTES = 65_535
export const LOCAL_MAX_PENDING_SOCKETS = 8
export const LOCAL_MAX_ADDRESSES = 8
export const LOCAL_HEARTBEAT_INTERVAL_MS = 25_000

export const localErrorCodes = [
  'INVALID_MESSAGE',
  'UNSUPPORTED_VERSION',
  'RATE_LIMITED',
  'PEER_NOT_PAIRED',
  'PEER_IDENTITY_MISMATCH',
  'PAIRING_CLOSED',
  'PAIRING_REJECTED',
  'SECURE_CHANNEL_FAILED',
  'CONNECTION_REPLACED',
  'HOST_STOPPING',
] as const
export type LocalErrorCode = typeof localErrorCodes[number]

const MAX_NAME_BYTES = 128
const utf8Length = (value: string): number => new TextEncoder().encode(value).byteLength
const deviceIdSchema = z.string().refine(value => (
  /^[0-9A-HJKMNP-TV-Z]{26}$/iu.test(value)
  || /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
), 'Device ID must be a ULID or UUID.')
const identityKeySchema = z.string().regex(/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/u)
const nameSchema = z.string()
  .refine(value => utf8Length(value) >= 1 && utf8Length(value) <= MAX_NAME_BYTES)
  .refine(value => value.trim().length > 0 && !/[\u0000-\u001f\u007f]/u.test(value))
const platformSchema = z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9._-]*$/u)
const versionSchema = z.string().min(1).max(64).regex(/^[0-9A-Za-z.+_-]+$/u)
const capabilitiesSchema = z.array(z.string().min(1).max(128).regex(/^[a-z0-9][a-z0-9._-]*$/u)).max(128)
  .refine(values => new Set(values).size === values.length)
/** Canonical, unpadded base64url of exactly `bytes` bytes. */
const fixedBase64Url = (bytes: number) => z.string()
  .length(Math.ceil(bytes * 4 / 3))
  .regex(/^[A-Za-z0-9_-]+$/u)
  .refine(value => {
    const remainder = (bytes * 8) % 6
    if (remainder === 0) return true
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
    const unused = 6 - remainder
    return (alphabet.indexOf(value.at(-1)!) & ((1 << unused) - 1)) === 0
  })
const handshakeDataSchema = z.string().min(1).max(4096).regex(/^[A-Za-z0-9_-]+$/u)
  .refine(value => value.length % 4 !== 1)

export const localHelloPayloadSchema = z.object({
  clientDeviceId: deviceIdSchema,
  clientIdentityKey: identityKeySchema,
  name: nameSchema,
  platform: platformSchema,
  clientVersion: versionSchema.optional(),
  capabilities: capabilitiesSchema,
  intent: z.enum(['connect', 'pair']),
}).strict()

export const localHelloAckPayloadSchema = z.object({
  hostDeviceId: deviceIdSchema,
  hostIdentityKey: identityKeySchema,
  name: nameSchema,
  connectionId: deviceIdSchema,
  capabilities: capabilitiesSchema,
  hostVersion: versionSchema.optional(),
}).strict()

export const localHandshakePayloadSchema = z.object({
  connectionId: deviceIdSchema,
  step: z.union([z.literal(1), z.literal(2)]),
  data: handshakeDataSchema,
}).strict()

export const localErrorPayloadSchema = z.object({
  code: z.string().min(1).max(64).regex(/^[A-Z][A-Z0-9_]*$/u),
  message: z.string().max(512),
}).strict()

/** Plaintext JSON frames before the secure channel is ready. */
export const localControlFrameSchema = z.discriminatedUnion('type', [
  z.object({ v: z.literal(LOCAL_DIRECT_VERSION), type: z.literal('local.hello'), payload: localHelloPayloadSchema }).strict(),
  z.object({ v: z.literal(LOCAL_DIRECT_VERSION), type: z.literal('local.hello.ack'), payload: localHelloAckPayloadSchema }).strict(),
  z.object({ v: z.literal(LOCAL_DIRECT_VERSION), type: z.literal('secure.handshake'), payload: localHandshakePayloadSchema }).strict(),
  z.object({ v: z.literal(LOCAL_DIRECT_VERSION), type: z.literal('local.error'), payload: localErrorPayloadSchema }).strict(),
])

/**
 * Pairing frames are the first Noise transport plaintexts of an `intent: pair`
 * connection, never sent in the clear.
 */
export const localPairFrameSchema = z.discriminatedUnion('type', [
  z.object({ v: z.literal(LOCAL_DIRECT_VERSION), type: z.literal('local.pair.prove'), payload: z.object({ proof: fixedBase64Url(32) }).strict() }).strict(),
  z.object({ v: z.literal(LOCAL_DIRECT_VERSION), type: z.literal('local.pair.ok'), payload: z.object({ pairingId: deviceIdSchema }).strict() }).strict(),
])

export type LocalHelloPayload = z.infer<typeof localHelloPayloadSchema>
export type LocalHelloAckPayload = z.infer<typeof localHelloAckPayloadSchema>
export type LocalHandshakePayload = z.infer<typeof localHandshakePayloadSchema>
export type LocalErrorPayload = z.infer<typeof localErrorPayloadSchema>
export type LocalControlFrame = z.infer<typeof localControlFrameSchema>
export type LocalPairFrame = z.infer<typeof localPairFrameSchema>

export function encodeLocalControlFrame(frame: LocalControlFrame): string {
  const encoded = JSON.stringify(localControlFrameSchema.parse(frame))
  if (utf8Length(encoded) > LOCAL_MAX_PREAUTH_FRAME_BYTES) throw new Error('Local control frame exceeds its limit.')
  return encoded
}

export function decodeLocalControlFrame(data: string | Uint8Array): LocalControlFrame {
  const bytes = typeof data === 'string' ? utf8Length(data) : data.byteLength
  if (bytes > LOCAL_MAX_PREAUTH_FRAME_BYTES) throw new Error('Local control frame exceeds its limit.')
  return localControlFrameSchema.parse(parseWireJson(data))
}

export function encodeLocalPairFrame(frame: LocalPairFrame): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(localPairFrameSchema.parse(frame)))
}

export function decodeLocalPairFrame(data: Uint8Array): LocalPairFrame {
  if (data.byteLength > LOCAL_MAX_PREAUTH_FRAME_BYTES) throw new Error('Local pairing frame exceeds its limit.')
  return localPairFrameSchema.parse(parseWireJson(data))
}

/** Information carried by a Host pairing QR code. */
export interface LocalPairingLink {
  hostDeviceId: string
  hostIdentityKey: string
  addresses: string[]
  pairingCode: string
  name?: string
}

const pairingCodeSchema = fixedBase64Url(16)

export function formatLocalPairingLink(link: LocalPairingLink): string {
  const parsed = parseLink(link)
  const params = new URLSearchParams()
  params.set('v', String(LOCAL_DIRECT_VERSION))
  params.set('id', parsed.hostDeviceId)
  params.set('k', parsed.hostIdentityKey)
  params.set('a', parsed.addresses.join(','))
  params.set('c', parsed.pairingCode)
  if (parsed.name !== undefined) params.set('n', parsed.name)
  return `${LOCAL_PAIRING_URI_SCHEME}//${LOCAL_PAIRING_URI_HOST}?${params.toString()}`
}

export function parseLocalPairingLink(value: string): LocalPairingLink {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new TypeError('Pairing link is not a URL.')
  }
  if (url.protocol !== LOCAL_PAIRING_URI_SCHEME || url.hostname !== LOCAL_PAIRING_URI_HOST
    || url.username !== '' || url.password !== '' || url.port !== '' || (url.pathname !== '' && url.pathname !== '/') || url.hash !== '') {
    throw new TypeError('Pairing link has the wrong shape.')
  }
  const params = url.searchParams
  for (const key of new Set(params.keys())) {
    if (!['v', 'id', 'k', 'a', 'c', 'n'].includes(key) || params.getAll(key).length !== 1) {
      throw new TypeError('Pairing link has unknown or repeated fields.')
    }
  }
  if (params.get('v') !== String(LOCAL_DIRECT_VERSION)) throw new TypeError('Pairing link version is not supported.')
  return parseLink({
    hostDeviceId: params.get('id') ?? '',
    hostIdentityKey: params.get('k') ?? '',
    addresses: (params.get('a') ?? '').split(',').filter(item => item.length > 0),
    pairingCode: params.get('c') ?? '',
    ...(params.has('n') ? { name: params.get('n')! } : {}),
  })
}

function parseLink(link: LocalPairingLink): LocalPairingLink {
  const hostDeviceId = deviceIdSchema.parse(link.hostDeviceId)
  const hostIdentityKey = identityKeySchema.parse(link.hostIdentityKey)
  const pairingCode = pairingCodeSchema.parse(link.pairingCode)
  if (link.addresses.length === 0 || link.addresses.length > LOCAL_MAX_ADDRESSES) {
    throw new TypeError('Pairing link must carry 1 to 8 addresses.')
  }
  const addresses = link.addresses.map(parseLocalAddress).map(formatLocalAddress)
  const name = link.name === undefined ? undefined : nameSchema.parse(link.name)
  return { hostDeviceId, hostIdentityKey, addresses, pairingCode, ...(name === undefined ? {} : { name }) }
}

export interface LocalAddress {
  host: string
  port: number
}

/** Parses `192.168.1.10:47821` or `[fd00::1]:47821`; only private-network literals are accepted. */
export function parseLocalAddress(value: string): LocalAddress {
  const match = /^(?:\[([0-9A-Fa-f:.]+)\]|([0-9.]+)):(\d{1,5})$/u.exec(value)
  if (match === null) throw new TypeError('Local address must be an IP literal with a port.')
  const host = (match[1] ?? match[2])!.toLowerCase()
  const port = Number(match[3])
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new TypeError('Local address port is invalid.')
  if (!isPrivateNetworkAddress(host)) throw new TypeError('Local address must be a private-network address.')
  return { host, port }
}

export function formatLocalAddress(address: LocalAddress): string {
  return address.host.includes(':') ? `[${address.host}]:${address.port}` : `${address.host}:${address.port}`
}

/**
 * Loopback, RFC 1918, link-local, CGNAT (Tailscale), IPv6 ULA (common for
 * WireGuard) and IPv6 link-local/loopback. Public addresses are refused.
 */
export function isPrivateNetworkAddress(host: string): boolean {
  const v4 = parseIpv4(host)
  if (v4 !== undefined) {
    const [a, b] = v4
    return a === 10 || a === 127
      || (a === 172 && b! >= 16 && b! <= 31)
      || (a === 192 && b === 168)
      || (a === 169 && b === 254)
      || (a === 100 && b! >= 64 && b! <= 127)
  }
  const v6 = parseIpv6(host)
  if (v6 === undefined) return false
  if (v6.every((word, index) => word === (index === 7 ? 1 : 0))) return true
  const mapped = v6.slice(0, 5).every(word => word === 0) && v6[5] === 0xffff
  if (mapped) return isPrivateNetworkAddress(`${v6[6]! >> 8}.${v6[6]! & 255}.${v6[7]! >> 8}.${v6[7]! & 255}`)
  return (v6[0]! & 0xfe00) === 0xfc00 || (v6[0]! & 0xffc0) === 0xfe80
}

function parseIpv4(value: string): number[] | undefined {
  const parts = value.split('.')
  if (parts.length !== 4 || parts.some(part => !/^(0|[1-9]\d{0,2})$/u.test(part))) return undefined
  const octets = parts.map(Number)
  return octets.every(octet => octet <= 255) ? octets : undefined
}

function parseIpv6(value: string): number[] | undefined {
  if (!/^[0-9a-f:.]+$/iu.test(value) || value.split('::').length > 2) return undefined
  let text = value
  const words: number[] = []
  const tailV4 = /(\d+\.\d+\.\d+\.\d+)$/u.exec(text)
  let tail: number[] = []
  if (tailV4 !== null) {
    const v4 = parseIpv4(tailV4[1]!)
    if (v4 === undefined) return undefined
    tail = [(v4[0]! << 8) | v4[1]!, (v4[2]! << 8) | v4[3]!]
    text = text.slice(0, -tailV4[1]!.length)
    if (text.endsWith(':') && !text.endsWith('::')) text = text.slice(0, -1)
  }
  const [head, rest] = text.split('::') as [string, string | undefined]
  const parse = (part: string): number[] | undefined => {
    if (part === '') return []
    const items = part.split(':')
    if (items.some(item => !/^[0-9a-f]{1,4}$/iu.test(item))) return undefined
    return items.map(item => Number.parseInt(item, 16))
  }
  const left = parse(head)
  const right = rest === undefined ? [] : parse(rest)
  if (left === undefined || right === undefined) return undefined
  const total = left.length + right.length + tail.length
  if (rest === undefined) {
    if (total !== 8) return undefined
    words.push(...left, ...tail)
  } else {
    if (total > 7) return undefined
    words.push(...left, ...new Array<number>(8 - total).fill(0), ...right, ...tail)
  }
  return words
}
