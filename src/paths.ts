import { homedir } from 'node:os'
import { join } from 'node:path'

/** `<DSH_HOME>/lango`: identity and pairings, separate from ds-harness-remote. */
export function langoRoot(env: NodeJS.ProcessEnv = process.env): string {
  return join(env.DSH_HOME || join(homedir(), '.dsh'), 'lango')
}
