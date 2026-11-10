import type { LocaleKey, Translate } from './locale.js'
import { qrPath } from './qr.js'
import type { Control, LangoDeviceView, LangoState, PairingRequest, StateFeed } from './store.js'

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface ClientReact {
  createElement(type: unknown, props?: object | null, ...children: unknown[]): unknown
  Fragment: unknown
  useState<T>(initial: T | (() => T)): [T, (next: T | ((previous: T) => T)) => void]
  useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void
  useRef<T>(initial: T): { current: T }
  useMemo<T>(factory: () => T, deps: readonly unknown[]): T
  useSyncExternalStore<T>(subscribe: (listener: () => void) => () => void, getSnapshot: () => T, getServerSnapshot?: () => T): T
}

export type PortalRenderer = (children: unknown, container: Element) => unknown

export interface PanelProps {
  control: Control
  feed: StateFeed
  t: Translate
}

type Run = (key: string, endpoint: string, payload?: unknown) => Promise<unknown>

const KNOWN_ERRORS = new Set(['NOT_LISTENING', 'NO_ADDRESS', 'REQUEST_GONE', 'DEVICE_NOT_FOUND'])

export function createLangoComponents(React: ClientReact, portal: PortalRenderer | undefined) {
  const h = React.createElement

  const icon = (d: string, size = 16) => h('svg', {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
  }, h('path', { d }))
  const icons = {
    phone: (size?: number) => icon('M8 2.5h8a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-15a2 2 0 0 1 2-2zM11 18.5h2', size),
    close: () => icon('M6 6l12 12M18 6L6 18'),
    pencil: () => icon('M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4', 14),
    trash: () => icon('M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3', 14),
    plus: () => icon('M12 5v14M5 12h14', 15),
  }

  function useFeed(feed: StateFeed) {
    return React.useSyncExternalStore(feed.subscribe, feed.getSnapshot, feed.getSnapshot)
  }

  function useNow(active: boolean): number {
    const [now, setNow] = React.useState(Date.now())
    React.useEffect(() => {
      if (!active) return
      setNow(Date.now())
      const timer = setInterval(() => setNow(Date.now()), 1_000)
      return () => clearInterval(timer)
    }, [active])
    return now
  }

  function errorText(reason: unknown, t: Translate): string {
    const code = typeof reason === 'object' && reason !== null ? (reason as { code?: unknown }).code : undefined
    if (typeof code === 'string' && KNOWN_ERRORS.has(code)) return t(`error${code}` as LocaleKey)
    return t('failed')
  }

  function relative(at: number, now: number, t: Translate): string {
    const minutes = Math.floor((now - at) / 60_000)
    if (minutes < 1) return t('justNow')
    if (minutes < 60) return t('minutesAgo', { n: minutes })
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return t('hoursAgo', { n: hours })
    return t('daysAgo', { n: Math.floor(hours / 24) })
  }

  function countdown(ms: number): string {
    const seconds = Math.max(0, Math.ceil(ms / 1_000))
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
  }

  function platformLabel(platform: string): string {
    if (platform.includes('android')) return 'Android'
    if (platform.includes('ios')) return 'iOS'
    if (platform.includes('ohos') || platform.includes('harmony')) return 'HarmonyOS'
    return platform
  }

  function groupCode(code: string): string {
    return `${code.slice(0, 3)} ${code.slice(3)}`
  }

  function Qr(props: { text: string; label: string }) {
    const qr = React.useMemo(() => qrPath(props.text), [props.text])
    return h('div', { className: 'lgo-qr', role: 'img', 'aria-label': props.label },
      h('svg', { viewBox: `0 0 ${qr.size} ${qr.size}`, shapeRendering: 'crispEdges' },
        h('path', { d: qr.path, fill: '#0b0d12' })))
  }

  function Meter(props: { from: number; to: number; now: number }) {
    const span = Math.max(1, props.to - props.from)
    const left = Math.min(1, Math.max(0, (props.to - props.now) / span))
    return h('div', { className: 'lgo-meter' }, h('i', { style: { width: `${left * 100}%` } }))
  }

  function HostSummary(props: { state: LangoState; t: Translate }) {
    const { host } = props.state
    const { t } = props
    const status = host.listening ? (host.pairable.length > 0 ? 'on' : 'warn') : 'bad'
    return h('div', { className: 'lgo-host' },
      h('div', { className: 'lgo-host-main' },
        h('div', { className: 'lgo-host-name' },
          h('span', { className: `lgo-dot ${status === 'on' ? 'is-on' : status === 'bad' ? 'is-bad' : ''}`, title: t(host.listening ? 'listening' : 'notListening') }),
          h('span', null, host.name)),
        host.pairable.length > 0
          ? h('div', { className: 'lgo-chips', 'aria-label': t('addresses') }, host.pairable.map(address => h('span', { key: address, className: 'lgo-chip' }, address)))
          : h('div', { className: 'lgo-meta' }, t(host.listening ? 'noAddress' : 'notListening')),
        h('div', { className: 'lgo-meta' }, `${t('fingerprint')} `, h('span', { className: 'lgo-mono' }, host.fingerprint))))
  }

  function PairingIdle(props: { state: LangoState; busy?: string; run: Run; t: Translate; onOpen: () => void }) {
    const { t } = props
    const ready = props.state.host.listening && props.state.host.pairable.length > 0
    return h('button', {
      type: 'button',
      className: 'lgo-btn is-primary',
      disabled: !ready || props.busy !== undefined,
      onClick: () => { props.onOpen(); void props.run('open', 'pairing.open') },
    }, icons.plus(), t('pairDevice'))
  }

  function PairingQr(props: { pairing: NonNullable<LangoState['pairing']>; busy?: string; run: Run; t: Translate; onOpen: () => void }) {
    const { t, pairing } = props
    const now = useNow(true)
    const [copied, setCopied] = React.useState(false)
    const openedAt = React.useRef(now)
    React.useEffect(() => { openedAt.current = Date.now() }, [pairing.link])
    const copy = (): void => {
      void navigator.clipboard?.writeText(pairing.link).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1_500)
      }, () => undefined)
    }
    return h('div', { className: 'lgo-card lgo-pair' },
      h(Qr, { text: pairing.link, label: t('pairScan') }),
      h('div', { className: 'lgo-pair-side' },
        h('strong', null, t('pairScan')),
        h('div', { className: 'lgo-meta lgo-countdown' }, t('pairExpires', { time: countdown(pairing.expiresAt - now) })),
        h(Meter, { from: openedAt.current, to: pairing.expiresAt, now }),
        h('div', { className: 'lgo-actions' },
          h('button', { type: 'button', className: 'lgo-btn is-small', onClick: copy }, t(copied ? 'copied' : 'copyLink')),
          h('button', { type: 'button', className: 'lgo-btn is-small', disabled: props.busy !== undefined, onClick: () => { props.onOpen(); void props.run('open', 'pairing.open') } }, t('regenerate')),
          h('button', { type: 'button', className: 'lgo-btn is-small', disabled: props.busy !== undefined, onClick: () => void props.run('close', 'pairing.close') }, t('cancel')))))
  }

  function PairingApproval(props: { request: PairingRequest; busy?: string; run: Run; t: Translate }) {
    const { t, request } = props
    const now = useNow(true)
    const decide = (approve: boolean) => props.run(approve ? 'allow' : 'deny', 'pairing.decide', { requestId: request.id, approve })
    return h('div', { className: 'lgo-card lgo-request', role: 'alertdialog', 'aria-label': t('requestTitle', { name: request.name }) },
      h('div', { className: 'lgo-request-head' },
        h('div', { className: 'lgo-device-icon' }, icons.phone(18)),
        h('div', { style: { minWidth: 0 } },
          h('strong', null, t('requestTitle', { name: request.name })),
          h('div', { className: 'lgo-meta' }, `${platformLabel(request.platform)} · ${request.address}`))),
      h('div', { className: 'lgo-code' },
        h('span', { className: 'lgo-meta' }, t('confirmationCode')),
        h('b', null, groupCode(request.confirmationCode))),
      h('dl', { className: 'lgo-kv' },
        h('dt', null, t('fingerprint')), h('dd', { className: 'lgo-mono' }, request.fingerprint)),
      h(Meter, { from: request.requestedAt, to: request.expiresAt, now }),
      h('div', { className: 'lgo-actions' },
        h('span', { className: 'lgo-meta lgo-countdown', style: { marginRight: 'auto', alignSelf: 'center' } }, t('requestHint')),
        h('button', { type: 'button', className: 'lgo-btn', disabled: props.busy !== undefined, onClick: () => void decide(false) }, t('deny')),
        h('button', { type: 'button', className: 'lgo-btn is-primary', disabled: props.busy !== undefined, onClick: () => void decide(true) }, t('allow'))))
  }

  function RttBadge(props: { device: LangoDeviceView; busy: boolean; run: Run; t: Translate }) {
    const { device, t } = props
    const rtt = device.rttMs
    const grade = rtt === undefined ? '' : rtt < 30 ? 'is-good' : rtt < 120 ? 'is-fair' : 'is-poor'
    return h('button', {
      type: 'button',
      className: `lgo-rtt ${grade} ${props.busy ? 'is-busy' : ''}`,
      title: t('measure'),
      'aria-label': `${t('latency')} ${rtt === undefined ? t('unmeasured') : `${Math.round(rtt)} ms`}`,
      disabled: props.busy,
      onClick: () => void props.run(`measure:${device.deviceId}`, 'device.measure', { deviceId: device.deviceId }),
    }, h('i'), rtt === undefined ? t('unmeasured') : `${rtt < 1 ? '<1' : Math.round(rtt)} ms`)
  }

  function DeviceRow(props: { device: LangoDeviceView; busy?: string; run: Run; t: Translate; now: number }) {
    const { device, t } = props
    const [editing, setEditing] = React.useState(false)
    const [name, setName] = React.useState(device.name)
    const [confirming, setConfirming] = React.useState(false)
    React.useEffect(() => {
      if (!confirming) return
      const timer = setTimeout(() => setConfirming(false), 3_000)
      return () => clearTimeout(timer)
    }, [confirming])
    const save = async (): Promise<void> => {
      const next = name.trim()
      setEditing(false)
      if (next !== '' && next !== device.name) await props.run(`rename:${device.deviceId}`, 'device.rename', { deviceId: device.deviceId, name: next })
    }
    const meta: string[] = [platformLabel(device.platform)]
    if (device.online && device.address !== undefined) meta.push(device.address)
    else if (!device.online) meta.push(device.lastSeenAt === undefined
      ? t('neverSeen', { time: relative(device.pairedAt, props.now, t) })
      : t('lastSeen', { time: relative(device.lastSeenAt, props.now, t) }))
    return h('div', { className: 'lgo-row' },
      h('span', { className: `lgo-dot ${device.online ? 'is-on' : ''}`, title: t(device.online ? 'online' : 'offline') }),
      h('div', { className: 'lgo-row-main' },
        editing
          ? h('input', {
            className: 'lgo-rename',
            value: name,
            maxLength: 80,
            autoFocus: true,
            'aria-label': t('rename'),
            onChange: (event: Event) => setName((event.target as HTMLInputElement).value),
            onBlur: () => void save(),
            onKeyDown: (event: KeyboardEvent) => {
              if (event.key === 'Enter') void save()
              if (event.key === 'Escape') { setName(device.name); setEditing(false) }
            },
          })
          : h('div', { className: 'lgo-row-name' }, h('span', { title: device.fingerprint }, device.name)),
        h('div', { className: 'lgo-row-meta' }, meta.map(item => h('span', { key: item }, item)))),
      device.online ? h(RttBadge, { device, busy: props.busy === `measure:${device.deviceId}`, run: props.run, t }) : null,
      h('div', { className: `lgo-row-tools ${confirming ? 'is-pinned' : ''}` },
        confirming
          ? h('button', {
            type: 'button',
            className: 'lgo-btn is-small is-danger',
            disabled: props.busy !== undefined,
            onClick: () => void props.run(`revoke:${device.deviceId}`, 'device.revoke', { deviceId: device.deviceId }),
          }, t('revokeConfirm'))
          : h(React.Fragment, null,
            h('button', { type: 'button', className: 'lgo-icon-btn', title: t('rename'), 'aria-label': t('rename'), onClick: () => { setName(device.name); setEditing(true) } }, icons.pencil()),
            h('button', { type: 'button', className: 'lgo-icon-btn', title: t('revoke'), 'aria-label': t('revoke'), onClick: () => setConfirming(true) }, icons.trash()))))
  }

  function Devices(props: { state: LangoState; busy?: string; run: Run; t: Translate }) {
    const { t, state } = props
    const now = useNow(state.devices.length > 0)
    return h('section', null,
      h('div', { className: 'lgo-section-head' },
        h('h3', null, t('devices')),
        state.devices.length > 0 ? h('span', { className: 'lgo-count' }, String(state.devices.length)) : null),
      state.devices.length === 0
        ? h('div', { className: 'lgo-empty' }, t('noDevices'))
        : h('div', { className: 'lgo-list' }, state.devices.map(device => h(DeviceRow, { key: device.deviceId, device, busy: props.busy, run: props.run, t, now }))))
  }

  function Switch(props: { checked: boolean; disabled?: boolean; label: string; onChange: (next: boolean) => void }) {
    return h('label', { className: 'lgo-switch-row' },
      h('span', null, props.label),
      h('button', {
        type: 'button',
        role: 'switch',
        'aria-checked': props.checked,
        'aria-label': props.label,
        className: `lgo-switch ${props.checked ? 'is-on' : ''}`,
        disabled: props.disabled,
        onClick: () => props.onChange(!props.checked),
      }, h('i')))
  }

  /** Host, pairing and devices; used inline on the plugin page and inside the dialog. */
  function LangoPanel(props: PanelProps) {
    const { t } = props
    const snapshot = useFeed(props.feed)
    const [busy, setBusy] = React.useState<string | undefined>(undefined)
    const [error, setError] = React.useState<string | undefined>(undefined)
    const openedHere = React.useRef(false)
    // A pairing window this panel opened must not outlive it.
    React.useEffect(() => () => {
      if (openedHere.current) void props.control('pairing.close').then(state => props.feed.publish(state), () => undefined)
    }, [])
    const run: Run = async (key, endpoint, payload) => {
      setBusy(key)
      setError(undefined)
      try {
        const result = await props.control<unknown>(endpoint, payload)
        const state = isState(result) ? result : (result as { state?: unknown } | undefined)?.state
        if (isState(state)) props.feed.publish(state)
        if (endpoint === 'pairing.close' || endpoint === 'pairing.decide') openedHere.current = false
        return result
      } catch (reason) {
        setError(errorText(reason, t))
        return undefined
      } finally {
        setBusy(undefined)
      }
    }
    if (snapshot.phase === 'loading') return h('div', { className: 'lgo-panel', 'aria-busy': true })
    if (snapshot.phase === 'unavailable') return h('div', { className: 'lgo-panel' }, h('div', { className: 'lgo-empty' }, t('unavailable')))
    const { state } = snapshot
    const onOpen = (): void => { openedHere.current = true }
    return h('div', { className: 'lgo-panel' },
      h(HostSummary, { state, t }),
      state.pairing?.request !== undefined
        ? h(PairingApproval, { request: state.pairing.request, busy, run, t })
        : state.pairing !== undefined
          ? h(PairingQr, { pairing: state.pairing, busy, run, t, onOpen })
          : h('div', null, h(PairingIdle, { state, busy, run, t, onOpen })),
      h(Devices, { state, busy, run, t }),
      h(Switch, {
        label: t('sidebarEntry'),
        checked: state.preferences.sidebarEntry,
        disabled: busy === 'preferences',
        onChange: (next: boolean) => void run('preferences', 'preferences.set', { sidebarEntry: next }),
      }),
      error === undefined ? null : h('p', { className: 'lgo-error', role: 'alert' }, error))
  }

  function LangoDialog(props: PanelProps & { onClose: () => void }) {
    React.useEffect(() => {
      const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') props.onClose() }
      window.addEventListener('keydown', onKey)
      return () => window.removeEventListener('keydown', onKey)
    }, [])
    const dialog = h('div', {
      className: 'lgo-backdrop',
      role: 'presentation',
      onMouseDown: (event: MouseEvent) => { if (event.target === event.currentTarget) props.onClose() },
    }, h('section', { className: 'lgo-dialog', role: 'dialog', 'aria-modal': true, 'aria-label': props.t('title') },
      h('div', { className: 'lgo-dialog-head' },
        h('strong', null, props.t('title')),
        h('span', { className: 'lgo-spacer' }),
        h('button', { type: 'button', className: 'lgo-icon-btn', 'aria-label': props.t('close'), onClick: props.onClose }, icons.close())),
      h('div', { className: 'lgo-dialog-body' }, h(LangoPanel, props))))
    return renderBodyPortal(dialog)
  }

  /** Sidebar footer entry: a dot while a phone is connected, a pulse while one waits for approval. */
  function LangoSidebarEntry(props: PanelProps & { wide?: boolean }) {
    const snapshot = useFeed(props.feed)
    const [open, setOpen] = React.useState(false)
    const state = snapshot.phase === 'ready' ? snapshot.state : undefined
    // Hidden unless switched on in the panel (plugin page); off by default.
    if (state?.preferences.sidebarEntry !== true) return null
    const waiting = state?.pairing?.request !== undefined
    const online = state?.devices.some(device => device.online) ?? false
    return h('div', { className: `lgo-entry ${props.wide ? 'is-wide' : ''}` },
      h('button', {
        type: 'button',
        className: 'lgo-entry-btn',
        title: props.t('open'),
        'aria-label': props.t('open'),
        onClick: () => setOpen(true),
      }, icons.phone(18),
      waiting || online ? h('span', { className: `lgo-badge ${waiting ? 'is-alert' : ''}` }) : null,
      props.wide ? h('span', null, props.t('title')) : null),
      open ? h(LangoDialog, { ...props, onClose: () => setOpen(false) }) : null)
  }

  function LangoConfigCard(props: PanelProps) {
    return h('div', { className: 'lgo-config', 'data-dsh-lango-settings': true }, h(LangoPanel, props))
  }

  function renderBodyPortal(children: unknown): unknown {
    if (typeof portal !== 'function' || typeof document === 'undefined' || document.body === null) return children
    try {
      return portal(children, document.body)
    } catch {
      return children
    }
  }

  return { LangoPanel, LangoDialog, LangoSidebarEntry, LangoConfigCard }
}

function isState(value: unknown): value is LangoState {
  return typeof value === 'object' && value !== null && 'devices' in value && 'host' in value
}
