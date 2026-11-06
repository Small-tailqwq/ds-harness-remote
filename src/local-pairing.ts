import { chmod, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { generateLocalPairingCode, verifyLocalPairingProof } from './crypto/index.js'
import { LOCAL_PAIRING_MAX_FAILURES, LOCAL_PAIRING_WINDOW_MS } from './protocol/index.js'
import { z } from 'zod'
import { fingerprint, IdentityStore, type HostIdentity } from './identity-store.js'
import { uuidV7 } from './ids.js'

/**
 * Local Direct trust: the Host identity and paired Clients for connections
 * that never touch a Remote Server. Lives beside, never inside, the
 * per-Server identity directories so account and Local trust stay isolated.
 *
 * Files are shared with the `ds-harness-remote local …` CLI, which runs in
 * another process, so every decision re-reads them.
 */
export const LOCAL_MEMBERSHIP_PREFIX = 'local:'

export function localStorageDirectory(root: string): string {
  return join(root, 'local', 'host')
}

const pairedDeviceSchema = z.object({
  deviceId: z.string().min(1).max(64),
  publicKey: z.string().min(1).max(64),
  fingerprint: z.string().min(1).max(64),
  name: z.string().min(1).max(80),
  platform: z.string().min(1).max(40),
  pairingId: z.string().uuid(),
  pairedAt: z.number().int().nonnegative(),
}).strict()

const pairedDevicesSchema = z.object({
  schemaVersion: z.literal(1),
  devices: z.array(pairedDeviceSchema).max(256),
}).strict()

const pairingWindowSchema = z.object({
  schemaVersion: z.literal(1),
  code: z.string().min(1).max(64),
  expiresAt: z.number().int().nonnegative(),
  failures: z.number().int().nonnegative(),
}).strict()

const listenerSchema = z.object({
  schemaVersion: z.literal(1),
  hostDeviceId: z.string().min(1),
  hostIdentityKey: z.string().min(1),
  name: z.string().min(1).max(80),
  addresses: z.array(z.string().min(1).max(64)).max(16),
  startedAt: z.number().int().nonnegative(),
  pid: z.number().int().nonnegative(),
}).strict()

export type PairedDevice = z.infer<typeof pairedDeviceSchema>
export type LocalListenerRecord = z.infer<typeof listenerSchema>

export interface LocalPairingWindow {
  code: string
  expiresAt: number
}

export type PairingProofResult =
  | { ok: true }
  | { ok: false; reason: 'closed' | 'rejected' }

export class LocalPairingStore {
  readonly directory: string
  private readonly identities: IdentityStore
  private devices = new Map<string, PairedDevice>()
  private devicesStamp = ''
  private queue: Promise<unknown> = Promise.resolve()

  constructor(root: string, private readonly now: () => number = Date.now) {
    this.directory = localStorageDirectory(root)
    this.identities = new IdentityStore({ directory: this.directory })
  }

  async loadIdentity(deviceName: string): Promise<HostIdentity> {
    const identity = await this.identities.loadOrCreate(deviceName.slice(0, 80))
    await this.reload()
    return identity
  }

  /** Re-read paired devices if another process changed them. */
  async reload(): Promise<boolean> {
    const path = this.devicesPath()
    let stamp = 'missing'
    try {
      const info = await stat(path)
      stamp = `${info.mtimeMs}:${info.size}`
    } catch (error) {
      if (!isMissing(error)) throw error
    }
    if (stamp === this.devicesStamp) return false
    const devices = new Map<string, PairedDevice>()
    if (stamp !== 'missing') {
      const parsed = pairedDevicesSchema.parse(JSON.parse(await readFile(path, 'utf8')))
      for (const device of parsed.devices) {
        if (device.fingerprint !== fingerprint(device.publicKey)) {
          throw new Error(`paired device ${device.deviceId} has an invalid fingerprint`)
        }
        devices.set(device.deviceId, device)
      }
    }
    this.devices = devices
    this.devicesStamp = stamp
    return true
  }

  isTrusted(deviceId: string, publicKey: string): boolean {
    return this.devices.get(deviceId)?.publicKey === publicKey
  }

  hasDevice(deviceId: string): boolean {
    return this.devices.has(deviceId)
  }

  pairedDevice(deviceId: string): PairedDevice | undefined {
    const device = this.devices.get(deviceId)
    return device === undefined ? undefined : { ...device }
  }

  listPairedDevices(): PairedDevice[] {
    return [...this.devices.values()].map(device => ({ ...device }))
  }

  /** Open (or replace) the pairing window with a fresh one-time code. */
  openWindow(windowMs = LOCAL_PAIRING_WINDOW_MS): Promise<LocalPairingWindow> {
    return this.serialize(async () => {
      const window = { code: generateLocalPairingCode(), expiresAt: this.now() + windowMs }
      await atomicJsonWrite(this.windowPath(), { schemaVersion: 1, ...window, failures: 0 })
      return window
    })
  }

  closeWindow(): Promise<void> {
    return this.serialize(() => rm(this.windowPath(), { force: true }))
  }

  async activeWindow(): Promise<LocalPairingWindow | undefined> {
    const window = await this.readWindow()
    return window === undefined ? undefined : { code: window.code, expiresAt: window.expiresAt }
  }

  /**
   * Check a pairing proof against the open window. A correct proof consumes the
   * window; wrong proofs count toward a limit that closes it.
   */
  verifyProof(handshakeHash: Uint8Array, proof: string): Promise<PairingProofResult> {
    return this.serialize(async () => {
      const window = await this.readWindow()
      if (window === undefined) return { ok: false, reason: 'closed' } as const
      if (verifyLocalPairingProof(window.code, handshakeHash, proof)) {
        await rm(this.windowPath(), { force: true })
        return { ok: true } as const
      }
      const failures = window.failures + 1
      if (failures >= LOCAL_PAIRING_MAX_FAILURES) await rm(this.windowPath(), { force: true })
      else await atomicJsonWrite(this.windowPath(), { ...window, failures })
      return { ok: false, reason: 'rejected' } as const
    })
  }

  pair(input: { deviceId: string; publicKey: string; name: string; platform: string }): Promise<PairedDevice> {
    return this.serialize(async () => {
      await this.reload()
      const device: PairedDevice = {
        deviceId: input.deviceId,
        publicKey: input.publicKey,
        fingerprint: fingerprint(input.publicKey),
        name: input.name.slice(0, 80),
        platform: input.platform.slice(0, 40),
        pairingId: uuidV7(this.now()),
        pairedAt: this.now(),
      }
      this.devices.set(device.deviceId, device)
      await this.saveDevices()
      return { ...device }
    })
  }

  revoke(deviceId: string): Promise<boolean> {
    return this.serialize(async () => {
      await this.reload()
      if (!this.devices.delete(deviceId)) return false
      await this.saveDevices()
      return true
    })
  }

  async writeListener(record: Omit<LocalListenerRecord, 'schemaVersion'>): Promise<void> {
    await atomicJsonWrite(this.listenerPath(), { schemaVersion: 1, ...record })
  }

  async clearListener(pid: number): Promise<void> {
    const current = await this.readListener()
    if (current?.pid === pid) await rm(this.listenerPath(), { force: true })
  }

  async readListener(): Promise<LocalListenerRecord | undefined> {
    try {
      return listenerSchema.parse(JSON.parse(await readFile(this.listenerPath(), 'utf8')))
    } catch (error) {
      if (isMissing(error)) return undefined
      throw error
    }
  }

  private async readWindow(): Promise<z.infer<typeof pairingWindowSchema> | undefined> {
    let window: z.infer<typeof pairingWindowSchema>
    try {
      window = pairingWindowSchema.parse(JSON.parse(await readFile(this.windowPath(), 'utf8')))
    } catch (error) {
      if (isMissing(error)) return undefined
      // A damaged window file must never authorize pairing.
      await rm(this.windowPath(), { force: true })
      return undefined
    }
    if (window.expiresAt <= this.now() || window.failures >= LOCAL_PAIRING_MAX_FAILURES) {
      await rm(this.windowPath(), { force: true })
      return undefined
    }
    return window
  }

  private async saveDevices(): Promise<void> {
    await atomicJsonWrite(this.devicesPath(), { schemaVersion: 1, devices: [...this.devices.values()] })
    const info = await stat(this.devicesPath())
    this.devicesStamp = `${info.mtimeMs}:${info.size}`
  }

  private serialize<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task)
    this.queue = run.catch(() => undefined)
    return run
  }

  private devicesPath(): string { return join(this.directory, 'paired-devices.json') }
  private windowPath(): string { return join(this.directory, 'pairing-window.json') }
  private listenerPath(): string { return join(this.directory, 'listener.json') }
}

async function atomicJsonWrite(path: string, value: unknown): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true, mode: 0o700 })
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  await chmod(temporary, 0o600).catch(() => undefined)
  await rename(temporary, path)
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as NodeJS.ErrnoException).code === 'ENOENT'
}
