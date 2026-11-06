import { hostname } from 'node:os'
import { z } from 'zod'

export const LOCAL_DIRECT_DEFAULT_PORT = 47821

export interface ResolvedLocalConfig {
  enabled: boolean
  port: number
  bind: string[]
}

export interface ResolvedConfig {
  local: ResolvedLocalConfig
  deviceName: string
  terminal: boolean
  logLevel: 'debug' | 'info' | 'warn' | 'error'
}

const configSchema = z.object({
  port: z.number().int().min(1024).max(65535).optional(),
  bind: z.array(z.string().min(1).max(64)).max(16).optional(),
  deviceName: z.string().trim().min(1).max(80).optional(),
  terminal: z.boolean().optional(),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).optional(),
})

export type Config = z.input<typeof configSchema>

export function resolveConfig(input: unknown): ResolvedConfig {
  const parsed = configSchema.parse(input ?? {})
  return {
    local: {
      enabled: true,
      port: parsed.port ?? LOCAL_DIRECT_DEFAULT_PORT,
      bind: [...new Set(parsed.bind ?? [])],
    },
    deviceName: parsed.deviceName ?? hostname(),
    terminal: parsed.terminal ?? true,
    logLevel: parsed.logLevel ?? 'info',
  }
}
