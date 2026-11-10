import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'

const preferencesSchema = z.object({
  schemaVersion: z.literal(1),
  /** Show the Lango entry in the sidebar footer. Off by default. */
  sidebarEntry: z.boolean(),
}).strict()

export interface LangoPreferences {
  sidebarEntry: boolean
}

const DEFAULTS: LangoPreferences = { sidebarEntry: false }

/** Panel preferences, kept beside the pairings; a missing or damaged file means defaults. */
export class PreferencesStore {
  private current: LangoPreferences = { ...DEFAULTS }
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private readonly directory: string) {}

  async load(): Promise<LangoPreferences> {
    try {
      const parsed = preferencesSchema.parse(JSON.parse(await readFile(this.path(), 'utf8')))
      this.current = { sidebarEntry: parsed.sidebarEntry }
    } catch {
      this.current = { ...DEFAULTS }
    }
    return this.get()
  }

  get(): LangoPreferences {
    return { ...this.current }
  }

  update(patch: Partial<LangoPreferences>): Promise<LangoPreferences> {
    const run = this.queue.then(async () => {
      this.current = { ...this.current, ...patch }
      await mkdir(this.directory, { recursive: true, mode: 0o700 })
      const temporary = `${this.path()}.${process.pid}.${Date.now()}.tmp`
      await writeFile(temporary, `${JSON.stringify({ schemaVersion: 1, ...this.current }, null, 2)}\n`, { mode: 0o600 })
      await chmod(temporary, 0o600).catch(() => undefined)
      await rename(temporary, this.path())
      return this.get()
    })
    this.queue = run.catch(() => undefined)
    return run
  }

  async flush(): Promise<void> {
    await this.queue
  }

  private path(): string { return join(this.directory, 'preferences.json') }
}
