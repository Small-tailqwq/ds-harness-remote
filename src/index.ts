import { resolveConfig, type Config } from './config.js'
import { registerControlRoute, type HostWebServerLike } from './control-route.js'
import { readHarnessDistributionVersion } from './harness-version.js'
import { SafeLogger } from './logging.js'
import { createOwnerPeerFactory, type OwnerPeerServiceLike } from './owner-peer.js'
import { langoRoot } from './paths.js'
import { LangoRuntime } from './runtime.js'
import type { LocalTypertGateway, TypertGatewayLike } from './typert-gateway-contract.js'
import { TypertGatewaySwitch } from './typert-gateway-switch.js'

export const name = 'dsh-lango'

/** The slice of the Cordis Context lango touches; the Host supplies the real one. */
interface LoggerLike {
  debug(message: string): void
  info(message: string): void
  warn(message: string): void
  error(message: string): void
}

interface ContextLike {
  logger: LoggerLike
  get(name: string, strict?: boolean): unknown
  inject(deps: string[], callback: (ctx: ContextLike) => void | Promise<void>): unknown
  effect(execute: () => unknown, label?: string): unknown
}

type EntryConfigLike = { get(): Config } | Config | undefined

export function apply(ctx: ContextLike, entry: EntryConfigLike = undefined): void {
  ctx.inject(['typertGateway', 'connection'], runtimeContext => activate(runtimeContext, readEntryConfig(entry)))
}

async function activate(ctx: ContextLike, input: Config): Promise<void> {
  const config = resolveConfig(input)
  const logger = new SafeLogger({
    debug: message => ctx.logger.debug(message),
    info: message => ctx.logger.info(message),
    warn: message => ctx.logger.warn(message),
    error: message => ctx.logger.error(message),
  }, config.logLevel)
  const nativeGateway = ctx.get('typertGateway') as TypertGatewayLike
  const switcher = new TypertGatewaySwitch(nativeGateway)
  if (!switcher.supportsCarrier()) {
    logger.warn('lango needs a Harness with the official Typert Remote carrier; not starting')
    return
  }
  // Harness 0.2.2 reads the calling Peer for every local carrier stream; each
  // authenticated connection gets its own owner Peer from the Connection Host.
  const connection = ctx.get('connection', false) as OwnerPeerServiceLike | undefined
  const createOwnerPeer = createOwnerPeerFactory(ctx, undefined, connection)
  const gateway: LocalTypertGateway = switcher.local()
  gateway.createPeer = () => {
    const peer = createOwnerPeer()
    if (peer === undefined) return gateway
    return { ...switcher.local(peer), dispose: async () => { await peer.dispose?.() } }
  }
  const harnessVersion = await readHarnessDistributionVersion()
  if (harnessVersion === undefined) logger.warn('Harness version is unavailable')
  const runtime = new LangoRuntime(config, langoRoot(), gateway, logger, harnessVersion)
  const webServer = ctx.get('webServer', false) as HostWebServerLike | undefined
  await ctx.effect(async () => {
    try {
      await runtime.start()
    } catch (error) {
      await runtime.close()
      throw error
    }
    // Pairing and device management happen only in the Desktop panel.
    const disposeControl = registerControlRoute(connection as Parameters<typeof registerControlRoute>[0], webServer, runtime, logger)
    return async () => {
      await disposeControl()
      await runtime.close()
    }
  }, 'dsh-lango lifecycle')
}

function readEntryConfig(entry: EntryConfigLike): Config {
  if (entry === undefined) return {}
  return typeof (entry as { get?: unknown }).get === 'function' ? (entry as { get(): Config }).get() : entry as Config
}
