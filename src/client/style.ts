const css = `
.lgo-backdrop{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:20px;background:var(--dsw-alias-bg-mask-3,rgba(0,0,0,.32));-webkit-app-region:no-drag;animation:lgo-fade .14s ease-out}
.lgo-dialog{width:min(520px,100%);max-height:min(720px,calc(100vh - 40px));display:flex;flex-direction:column;overflow:hidden;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:14px;box-shadow:var(--dsw-shadow-lv2,0 12px 40px rgba(0,0,0,.18));animation:lgo-rise .18s cubic-bezier(.2,.8,.2,1)}
.lgo-dialog-head{display:flex;align-items:center;gap:10px;padding:14px 16px 12px 18px;border-bottom:1px solid var(--dsw-alias-border-l1,var(--dsw-alias-border-l2))}
.lgo-dialog-head strong{font-size:15px;font-weight:600}
.lgo-dialog-body{overflow:auto;padding:16px 18px 18px}
.lgo-panel{display:grid;gap:18px;font-size:13px;line-height:1.5}
.lgo-panel button{font:inherit}
.lgo-icon-btn{width:28px;height:28px;display:inline-grid;place-items:center;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;padding:0}
.lgo-icon-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.lgo-icon-btn:disabled{opacity:.4;cursor:default}
.lgo-icon-btn:focus-visible,.lgo-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.lgo-spacer{flex:1}
.lgo-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:32px;padding:0 14px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;white-space:nowrap}
.lgo-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.lgo-btn:disabled{opacity:.45;cursor:default}
.lgo-btn.is-primary{border-color:transparent;background:var(--dsw-alias-brand-primary);color:#fff}
.lgo-btn.is-primary:hover:not(:disabled){filter:brightness(1.06);background:var(--dsw-alias-brand-primary)}
.lgo-btn.is-danger{color:var(--dsw-alias-state-error-primary,#d14343)}
.lgo-btn.is-small{min-height:26px;padding:0 10px;font-size:12px;border-radius:7px}
.lgo-host{display:flex;align-items:flex-start;gap:12px}
.lgo-host-main{min-width:0;flex:1;display:grid;gap:4px}
.lgo-host-name{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600}
.lgo-chips{display:flex;flex-wrap:wrap;gap:6px}
.lgo-chip{font-family:var(--dsw-font-mono,ui-monospace,Consolas,monospace);font-size:11.5px;padding:1px 7px;border-radius:6px;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-secondary)}
.lgo-meta{color:var(--dsw-alias-label-tertiary);font-size:12px}
.lgo-mono{font-family:var(--dsw-font-mono,ui-monospace,Consolas,monospace);letter-spacing:.02em}
.lgo-dot{width:8px;height:8px;border-radius:50%;flex:none;background:var(--dsw-alias-label-dimmed,#b7bcc6)}
.lgo-dot.is-on{background:var(--dsw-alias-state-success-primary,#2fa36b);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-state-success-primary,#2fa36b) 18%,transparent)}
.lgo-dot.is-bad{background:var(--dsw-alias-state-error-primary,#d14343)}
.lgo-card{border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-2,transparent);padding:16px}
.lgo-pair{display:grid;grid-template-columns:auto 1fr;gap:18px;align-items:center}
.lgo-qr{width:184px;height:184px;padding:10px;border-radius:10px;background:#fff;box-sizing:border-box;display:block}
.lgo-qr svg{display:block;width:100%;height:100%}
.lgo-pair-side{display:grid;gap:10px;align-content:center;min-width:0}
.lgo-pair-side strong{font-size:14px;font-weight:600}
.lgo-actions{display:flex;flex-wrap:wrap;gap:8px}
.lgo-countdown{font-variant-numeric:tabular-nums}
.lgo-meter{height:3px;border-radius:2px;background:var(--dsw-alias-bg-layer-3);overflow:hidden}
.lgo-meter>i{display:block;height:100%;background:var(--dsw-alias-brand-primary);transition:width 1s linear}
.lgo-request{display:grid;gap:14px;animation:lgo-rise .2s cubic-bezier(.2,.8,.2,1)}
.lgo-request-head{display:flex;align-items:center;gap:12px}
.lgo-device-icon{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;flex:none;background:color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,transparent);color:var(--dsw-alias-brand-primary)}
.lgo-code{display:flex;flex-direction:column;align-items:center;gap:4px;padding:14px 12px;border-radius:10px;background:var(--dsw-alias-bg-layer-3)}
.lgo-code b{font-family:var(--dsw-font-mono,ui-monospace,Consolas,monospace);font-size:30px;font-weight:600;letter-spacing:.12em;font-variant-numeric:tabular-nums}
.lgo-kv{display:grid;grid-template-columns:auto 1fr;gap:4px 14px;font-size:12px}
.lgo-kv dt{color:var(--dsw-alias-label-tertiary)}
.lgo-kv dd{margin:0;min-width:0;overflow-wrap:anywhere}
.lgo-request .lgo-actions{justify-content:flex-end}
.lgo-section-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.lgo-section-head h3{margin:0;font-size:13px;font-weight:600}
.lgo-count{font-size:12px;color:var(--dsw-alias-label-tertiary)}
.lgo-list{display:grid;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;overflow:hidden}
.lgo-row{display:flex;align-items:center;gap:12px;padding:10px 12px;min-height:52px;box-sizing:border-box}
.lgo-row+.lgo-row{border-top:1px solid var(--dsw-alias-border-l1,var(--dsw-alias-border-l2))}
.lgo-row-main{min-width:0;flex:1;display:grid;gap:2px}
.lgo-row-name{display:flex;align-items:center;gap:8px;font-weight:500;min-width:0}
.lgo-row-name span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lgo-row-meta{display:flex;flex-wrap:wrap;gap:0 10px;color:var(--dsw-alias-label-tertiary);font-size:12px}
.lgo-row-tools{display:flex;align-items:center;gap:2px;opacity:.0;transition:opacity .12s}
.lgo-row:hover .lgo-row-tools,.lgo-row:focus-within .lgo-row-tools,.lgo-row-tools.is-pinned{opacity:1}
.lgo-rtt{display:inline-flex;align-items:center;gap:5px;font-variant-numeric:tabular-nums;font-size:12px;padding:2px 8px;border-radius:999px;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-secondary);border:0;cursor:pointer}
.lgo-rtt:hover:not(:disabled){color:var(--dsw-alias-label-primary)}
.lgo-rtt i{width:6px;height:6px;border-radius:50%;background:currentColor}
.lgo-rtt.is-good i{background:var(--dsw-alias-state-success-primary,#2fa36b)}
.lgo-rtt.is-fair i{background:var(--dsw-alias-state-warning-primary,#c98a00)}
.lgo-rtt.is-poor i{background:var(--dsw-alias-state-error-primary,#d14343)}
.lgo-rtt.is-busy{opacity:.6}
.lgo-rename{flex:1;min-width:0;font:inherit;padding:3px 8px;border-radius:6px;border:1px solid var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-1);color:inherit;outline:none}
.lgo-empty{padding:22px 12px;text-align:center;color:var(--dsw-alias-label-tertiary);border:1px dashed var(--dsw-alias-border-l2);border-radius:12px}
.lgo-error{color:var(--dsw-alias-state-error-primary,#d14343);font-size:12px}
.lgo-entry{box-sizing:border-box;flex:none;display:block}
.lgo-entry-btn{position:relative;height:36px;min-width:36px;display:flex;align-items:center;justify-content:center;gap:6px;padding:0;border:0;border-radius:50%;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:14px}
.lgo-entry.is-wide .lgo-entry-btn{border-radius:8px;padding:0 8px;justify-content:flex-start;color:var(--dsw-alias-label-primary)}
.lgo-entry-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.lgo-entry-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.lgo-entry-btn .lgo-badge{position:absolute;top:7px;left:22px;width:7px;height:7px;border-radius:50%;border:1.5px solid var(--dsw-alias-bg-layer-1);background:var(--dsw-alias-state-success-primary,#2fa36b)}
.lgo-entry-btn .lgo-badge.is-alert{background:var(--dsw-alias-state-error-primary,#d14343);animation:lgo-pulse 1.2s ease-in-out infinite}
.lgo-config{margin-top:4px}
.lgo-switch-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:2px;color:var(--dsw-alias-label-secondary);cursor:pointer}
.lgo-switch{position:relative;flex:none;width:34px;height:20px;padding:0;border:0;border-radius:999px;background:var(--dsw-alias-border-l4,#c9ced6);cursor:pointer;transition:background .15s}
.lgo-switch i{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2);transition:transform .15s}
.lgo-switch.is-on{background:var(--dsw-alias-brand-primary)}
.lgo-switch.is-on i{transform:translateX(14px)}
.lgo-switch:disabled{opacity:.5;cursor:default}
.lgo-switch:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
@keyframes lgo-fade{from{opacity:0}to{opacity:1}}
@keyframes lgo-rise{from{opacity:0;transform:translateY(6px) scale(.99)}to{opacity:1;transform:none}}
@keyframes lgo-pulse{50%{transform:scale(1.35)}}
@media (prefers-reduced-motion:reduce){.lgo-backdrop,.lgo-dialog,.lgo-request,.lgo-entry-btn .lgo-badge.is-alert{animation:none}}
@media (max-width:560px){.lgo-pair{grid-template-columns:1fr;justify-items:center;text-align:center}.lgo-pair-side .lgo-actions{justify-content:center}}
`

export function installStyle(moduleId: string): () => void {
  const style = document.createElement('style')
  style.dataset.plugin = moduleId
  style.textContent = css
  document.head.append(style)
  return () => style.remove()
}
