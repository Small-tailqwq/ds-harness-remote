// Desktop half of dsh-lango: the Lango panel (pairing QR code, approval,
// paired devices with latency), mounted as a sidebar entry and as the
// plugin's configuration card. It talks only to this Harness' own loopback
// control route.
import { CONTROL_RPC_PREFIX, EVENTS_ENDPOINT } from '../control-contract.js'
import { en, localeNamespace, staticTranslate, zh, type Translate } from './locale.js'
import { createLangoComponents, type ClientReact, type PortalRenderer } from './panel.js'
import { createStateFeed, type Control } from './store.js'
import { installStyle } from './style.js'

declare global {
  interface Window {
    __ModuleLoader__: {
      load(input: { id: string; factory: (require: (id: string) => unknown) => unknown }): void
    }
    __DSH_LANGO_CLIENT_ACTIVE__?: boolean
  }
}

const MODULE_ID = 'dsh-lango'

interface ControlResult {
  ok: boolean
  value?: unknown
  error?: { code?: string; message?: string }
}

interface ClientContext {
  connection: { rpc: { call(channel: string, endpoint: string, payload: unknown): Promise<ControlResult> } }
  effect(effect: () => (() => void), label: string): void
  locale?: {
    bind(namespace: string): Translate
    register(namespace: string, dictionaries: { zh: typeof zh; en: typeof en }): () => void
  }
  slots: {
    inject(name: string, factory: () => unknown): void
    register(options: Record<string, unknown>, component: unknown): unknown
  }
}

window.__ModuleLoader__.load({
  id: MODULE_ID,
  factory: require => {
    const module = { exports: {} as Record<string, unknown> }
    const React = require('react') as ClientReact
    const portal = (() => {
      try {
        const reactDom = require('react-dom') as { createPortal?: PortalRenderer }
        return typeof reactDom.createPortal === 'function' ? reactDom.createPortal.bind(reactDom) : undefined
      } catch {
        return undefined
      }
    })()
    const { LangoSidebarEntry, LangoConfigCard } = createLangoComponents(React, portal)

    function apply(ctx: ClientContext): void {
      if (window.__DSH_LANGO_CLIENT_ACTIVE__) return
      window.__DSH_LANGO_CLIENT_ACTIVE__ = true
      ctx.effect(() => () => { window.__DSH_LANGO_CLIENT_ACTIVE__ = false }, 'dsh-lango: client singleton')

      const control: Control = async <T,>(endpoint: string, payload: unknown = {}) => {
        const result = await ctx.connection.rpc.call(CONTROL_RPC_PREFIX, endpoint, payload)
        if (!result.ok) {
          throw Object.assign(new Error(result.error?.message ?? 'lango request failed'), { code: result.error?.code })
        }
        return result.value as T
      }
      const feed = createStateFeed(`${CONTROL_RPC_PREFIX.slice(1)}/${EVENTS_ENDPOINT}`, control)
      ctx.effect(() => () => feed.close(), 'dsh-lango: state feed')

      if (ctx.locale !== undefined) ctx.effect(() => ctx.locale!.register(localeNamespace, { zh, en }), 'dsh-lango: dictionaries')
      const fallback = staticTranslate(navigator.language.toLowerCase().startsWith('zh') ? zh : en)
      ctx.effect(() => installStyle(MODULE_ID), 'dsh-lango: styles')

      // Slot registrants receive `t` bound to `locale`; without the locale
      // service the components fall back to the browser language.
      const base = (): Record<string, unknown> => ({
        control,
        feed,
        ...(ctx.locale === undefined ? { t: fallback } : {}),
      })
      ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
        name: 'sidebar.footer.action',
        id: 'dsh-lango-entry',
        order: -10,
        locale: localeNamespace,
        inject: base,
      }, LangoSidebarEntry))
      // Configuration card on the plugin's row and bundle pages.
      ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
        name: 'plugins.row.config',
        key: 'dsh-lango#dsh-lango',
        locale: localeNamespace,
        inject: base,
      }, LangoConfigCard))
      ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
        name: 'plugins.bundle.config',
        key: 'dsh-lango',
        locale: localeNamespace,
        inject: base,
      }, LangoConfigCard))
    }

    module.exports.apply = apply
    module.exports.inject = ['connection', 'slots', 'locale']
    return module.exports
  },
})
