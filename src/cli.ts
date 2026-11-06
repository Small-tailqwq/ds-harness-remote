import { fingerprint } from './identity-store.js'
import { LocalPairingStore } from './local-pairing.js'
import { langoRoot } from './paths.js'
import { formatLocalPairingLink } from './protocol/index.js'

const PAIR_POLL_MS = 1_000
const TERMINAL_QR_MARGIN = 4

interface CliWriter {
  write(value: string): unknown
}

export interface LangoCliDependencies {
  env?: NodeJS.ProcessEnv
  stdout?: CliWriter
  stderr?: CliWriter
  now?: () => number
  wait?: (milliseconds: number) => Promise<void>
  renderQr?: (url: string) => Promise<string>
}

interface CliRuntime {
  env: NodeJS.ProcessEnv
  stdout: CliWriter
  stderr: CliWriter
  now: () => number
  wait: (milliseconds: number) => Promise<void>
  renderQr: (url: string) => Promise<string>
}

export async function runCli(
  args: readonly string[] = process.argv.slice(2),
  dependencies: LangoCliDependencies = {},
): Promise<number> {
  const runtime: CliRuntime = {
    env: dependencies.env ?? process.env,
    stdout: dependencies.stdout ?? process.stdout,
    stderr: dependencies.stderr ?? process.stderr,
    now: dependencies.now ?? Date.now,
    wait: dependencies.wait ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))),
    renderQr: dependencies.renderQr ?? renderTerminalQr,
  }
  const [action, ...rest] = args
  const store = new LocalPairingStore(langoRoot(runtime.env), runtime.now)
  try {
    if (action === 'pair' && rest.length === 0) return await pair(store, runtime)
    if (action === 'devices' && rest.length === 0) return await devices(store, runtime)
    if (action === 'revoke' && rest.length === 1) return await revoke(store, rest[0]!, runtime)
    if (action === undefined || action === 'help' || action === '--help' || action === '-h') {
      runtime.stdout.write(helpText())
      return action === undefined ? 1 : 0
    }
    runtime.stderr.write(helpText())
    return 1
  } catch (error) {
    runtime.stderr.write(`${error instanceof Error ? error.message : 'The lango command failed.'}\n`)
    return 1
  }
}

async function devices(store: LocalPairingStore, runtime: CliRuntime): Promise<number> {
  await store.reload()
  const paired = store.listPairedDevices()
  runtime.stdout.write(paired.length === 0 ? 'No paired devices.\n' : paired.map(device => (
    `${device.deviceId}  ${device.name} (${device.platform})  ${device.fingerprint}  paired ${new Date(device.pairedAt).toISOString()}\n`
  )).join(''))
  return 0
}

async function revoke(store: LocalPairingStore, deviceId: string, runtime: CliRuntime): Promise<number> {
  const removed = await store.revoke(deviceId)
  if (removed) runtime.stdout.write('Pairing removed. A running Host closes that device\'s connection within a few seconds.\n')
  else runtime.stderr.write('No paired device has that id.\n')
  return removed ? 0 : 1
}

async function pair(store: LocalPairingStore, runtime: CliRuntime): Promise<number> {
  const listener = await store.readListener()
  if (listener === undefined || !processAlive(listener.pid) || listener.addresses.length === 0) {
    runtime.stderr.write('lango is not running. Install and enable the dsh-lango plugin, then restart DeepSeek Harness.\n')
    return 1
  }
  await store.reload()
  const known = new Set(store.listPairedDevices().map(device => `${device.deviceId}:${device.pairingId}`))
  const window = await store.openWindow()
  const link = formatLocalPairingLink({
    hostDeviceId: listener.hostDeviceId,
    hostIdentityKey: listener.hostIdentityKey,
    addresses: listener.addresses.slice(0, 8),
    pairingCode: window.code,
    name: listener.name,
  })
  runtime.stdout.write('Open this link on the phone (or scan the QR code) to pair it with this Host:\n\n')
  runtime.stdout.write(`${(await runtime.renderQr(link)).trimEnd()}\n\n${link}\n\n`)
  runtime.stdout.write(`Host: ${listener.name}  fingerprint ${fingerprint(listener.hostIdentityKey)}\n`)
  runtime.stdout.write(`Addresses: ${listener.addresses.join(', ')}\n`)
  runtime.stdout.write(`The code is valid once and expires at ${new Date(window.expiresAt).toLocaleTimeString()}. Waiting for a device...\n`)
  while (runtime.now() < window.expiresAt) {
    await runtime.wait(PAIR_POLL_MS)
    if ((await store.activeWindow())?.code === window.code) continue
    await store.reload()
    const paired = store.listPairedDevices().find(device => !known.has(`${device.deviceId}:${device.pairingId}`))
    if (paired !== undefined) {
      runtime.stdout.write(`Paired ${paired.name} (${paired.platform}), fingerprint ${paired.fingerprint}.\n`)
      return 0
    }
    runtime.stderr.write('The pairing window was closed before a device paired.\n')
    return 1
  }
  await store.closeWindow()
  runtime.stderr.write('The pairing code expired. Run the command again for a new code.\n')
  return 1
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

export async function renderTerminalQr(url: string): Promise<string> {
  const { default: QRCode } = await import('qrcode')
  const modules = QRCode.create(url, { errorCorrectionLevel: 'M' }).modules
  const width = modules.size + TERMINAL_QR_MARGIN * 2
  const quietLine = `\u001B[47m${' '.repeat(width * 2)}\u001B[0m`
  const lines = Array.from({ length: TERMINAL_QR_MARGIN }, () => quietLine)
  for (let row = 0; row < modules.size; row += 1) {
    let line = `\u001B[47m${' '.repeat(TERMINAL_QR_MARGIN * 2)}`
    for (let column = 0; column < modules.size; column += 1) {
      line += modules.get(row, column) === 1 ? '\u001B[40m  ' : '\u001B[47m  '
    }
    line += `\u001B[47m${' '.repeat(TERMINAL_QR_MARGIN * 2)}\u001B[0m`
    lines.push(line)
  }
  lines.push(...Array.from({ length: TERMINAL_QR_MARGIN }, () => quietLine))
  return lines.join('\n')
}

function helpText(): string {
  return [
    'Usage:',
    '  lango pair               open a 5-minute pairing window and print the link',
    '  lango devices            list paired devices',
    '  lango revoke <device-id> remove a pairing',
    '',
    'The commands talk to the running DeepSeek Harness through <DSH_HOME>/lango.',
    '',
  ].join('\n')
}
