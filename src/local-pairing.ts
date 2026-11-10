import { chmod, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { fingerprint, IdentityStore, type HostIdentity } from './identity-store.js'
import { uuidV7 } from './ids.js'

/**
 * Local Direct trust: the Host identity and the paired Clients. Pairing
 * windows live only in the running Host's memory (see `pairing-gate.ts`), so
 * no other process can open one by writing a file.
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
  lastSeenAt: z.number().int().nonnegative().optional(),
}).strict()

const pairedDevicesSchema = z.object({
  schemaVersion: z.literal(1),
  devices: z.array(pairedDeviceSchema).max(256),
}).strict()

export type PairedDevice = z.infer<typeof pairedDeviceSchema>

/** Files from 0.1 that only the retired CLI read or wrote. */
const RETIRED_FILES = ['pairing-window.json', 'listener.json']

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
    // A stale window file from the retired CLI must never be read again.
    await Promise.all(RETIRED_FILES.map(file => rm(join(this.directory, file), { force: true }).catch(() => undefined)))
    await this.reload()
    return identity
  }

  /** Re-read paired devices if the file changed on disk. */
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

  rename(deviceId: string, name: string): Promise<boolean> {
    return this.serialize(async () => {
      await this.reload()
      const device = this.devices.get(deviceId)
      const trimmed = name.trim().slice(0, 80)
      if (device === undefined || trimmed === '') return false
      this.devices.set(deviceId, { ...device, name: trimmed })
      await this.saveDevices()
      return true
    })
  }

  /** Record a successful connection; best effort, never blocks trust. */
  touch(deviceId: string): Promise<void> {
    return this.serialize(async () => {
      const device = this.devices.get(deviceId)
      if (device === undefined) return
      this.devices.set(deviceId, { ...device, lastSeenAt: this.now() })
      await this.saveDevices()
    })
  }

  /** Resolves once every queued write has landed. */
  async flush(): Promise<void> {
    await this.queue
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
