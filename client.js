/**
 * dsh-restart client half.
 *
 * UI contract:
 *   - The restart button sits in `sidebar.footer.action`, immediately ABOVE the
 *     account/user button (the account launcher lives in `sidebar.settings`,
 *     which the sidebar renders below `sidebar.footer.action`). This yields a
 *     vertical stack: [restart button] / [user button].
 *   - A small visibility toggle sits next to the restart button; hovering the
 *     stack reveals it and clicking hides the restart button. A collapsed
 *     restore entry remains in the same place so the button can be shown again.
 *     The preference is stored in localStorage and synced across tabs.
 */
window.__ModuleLoader__.load({
  id: 'dsh-restart',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'dshRestart'
    const STYLE_ID = 'dsh-restart-style'
    const STORAGE_KEY = 'dsh-restart.button-visible'
    const VALUE_EVENT = 'dsh-restart:visibility-change'

    const DICTS = {
      zh: {
        action: '重启 DSH',
        retry: '重启失败，重试',
        busy: '正在请求重启…',
        restarting: 'DSH 正在重启，页面稍后自动刷新',
        failed: '重启请求失败：{message}',
        timeout: '等待 DSH 恢复超时，请手动执行 ollama launch dsh',
        toggleShow: '显示重启按钮',
        toggleHide: '隐藏重启按钮',
        shown: '重启按钮已显示',
        hidden: '重启按钮已隐藏',
        menuLabel: '重启按钮设置',
      },
      en: {
        action: 'Restart DSH',
        retry: 'Restart failed, retry',
        busy: 'Requesting restart…',
        restarting: 'DSH is restarting; the page refreshes when it is back',
        failed: 'Restart request failed: {message}',
        timeout: 'Timed out waiting for DSH; run ollama launch dsh manually',
        toggleShow: 'Show restart button',
        toggleHide: 'Hide restart button',
        shown: 'Restart button shown',
        hidden: 'Restart button hidden',
        menuLabel: 'Restart button settings',
      },
    }

    const CSS = `
.dsh-restart-row{display:flex;align-items:center;width:100%;min-width:0;padding-right:4px;box-sizing:border-box}
.dsh-restart-btn{display:flex;flex:1;min-width:0;align-items:center;justify-content:center;gap:6px;box-sizing:border-box;width:100%;height:32px;min-height:32px;padding:0 calc(var(--dsh-sidebar-row-padding, 12px) - var(--dsh-sidebar-paint-inset, 3px));border:none;border-radius:var(--dsw-radius-md);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:14px;line-height:22px;cursor:pointer;transition:background-color .15s ease,color .15s ease}
.dsh-restart-btn[data-narrow="true"]{flex:none;width:36px;height:36px;min-height:36px;padding:0;border-radius:var(--dsw-radius-md);margin:0 auto}
.dsh-restart-row .dsh-restart-btn[data-narrow="false"]{justify-content:flex-start}
.dsh-restart-btn[data-state="hidden"]{color:var(--dsw-alias-label-tertiary);opacity:.7}
.dsh-restart-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsh-restart-btn:focus-visible,.dsh-restart-toggle:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
.dsh-restart-btn:disabled{cursor:progress;opacity:.72}
.dsh-restart-btn[data-state="error"]{color:#d14343}
.dsh-restart-toggle{display:inline-flex;flex:none;align-items:center;justify-content:center;width:22px;height:24px;margin-left:2px;padding:0;border:none;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;opacity:0;transition:opacity .12s ease,background-color .15s ease,color .15s ease}
.dsh-restart-row:hover .dsh-restart-toggle,.dsh-restart-toggle:focus-visible{opacity:1}
.dsh-restart-toggle:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsh-restart-icon{display:inline-flex;align-items:center;justify-content:center}
.dsh-restart-spin{animation:dsh-restart-spin .9s linear infinite}
@keyframes dsh-restart-spin{to{transform:rotate(360deg)}}
`.trim()

    function getStorage() {
      try {
        return typeof localStorage === 'undefined' ? null : localStorage
      } catch {
        return null
      }
    }

    function isButtonVisible() {
      const store = getStorage()
      if (store === null) return true
      try {
        const value = store.getItem(STORAGE_KEY)
        return value === null || value === '1' || value === 'true'
      } catch {
        return true
      }
    }

    function setButtonVisible(visible) {
      const store = getStorage()
      try {
        store?.setItem(STORAGE_KEY, visible ? '1' : '0')
      } catch {
        // Storage may be unavailable (private mode); the current tab still updates.
      }
      try {
        window.dispatchEvent(new CustomEvent(VALUE_EVENT, { detail: { visible } }))
      } catch {
        // Older browsers: fall back to the storage event in other tabs.
      }
    }

    function useButtonVisible() {
      const [visible, setVisible] = React.useState(isButtonVisible)
      React.useEffect(() => {
        const update = (event) => {
          if (event instanceof StorageEvent && event.key !== STORAGE_KEY) return
          const next = event?.detail?.visible
          setVisible(typeof next === 'boolean' ? next : isButtonVisible())
        }
        window.addEventListener(VALUE_EVENT, update)
        window.addEventListener('storage', update)
        return () => {
          window.removeEventListener(VALUE_EVENT, update)
          window.removeEventListener('storage', update)
        }
      }, [])
      return [visible, setButtonVisible]
    }

    function detectLang() {
      try {
        const html = typeof document !== 'undefined' ? document.documentElement?.lang ?? '' : ''
        const nav = typeof navigator !== 'undefined' ? navigator.language ?? '' : ''
        return String(html || nav || 'en').toLowerCase()
      } catch {
        return 'en'
      }
    }

    function localTranslate(key, vars) {
      const lang = detectLang()
      const dict = lang.startsWith('zh') ? DICTS.zh : DICTS.en
      const template = dict[key] ?? DICTS.en[key] ?? key
      if (vars === undefined) return template
      return template.replace(/\{(\w+)\}/g, (_, name) => (name in vars ? String(vars[name]) : `{${name}}`))
    }

    function RestartIcon() {
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: 16,
          height: 16,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          focusable: 'false',
        },
        h('path', { d: 'M20.5 12a8.5 8.5 0 1 1-2.6-6.07' }),
        h('path', { d: 'M20.5 4.2v5h-5' }),
      )
    }

    function EyeIcon({ hidden }) {
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: 16,
          height: 16,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          focusable: 'false',
        },
        h('path', { d: 'M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z' }),
        h('circle', { cx: 12, cy: 12, r: 2.6 }),
        hidden ? h('path', { d: 'M4 20 20 4' }) : null,
      )
    }

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

    async function postRestart() {
      const response = await fetch('/dsh-restart/api/restart', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        cache: 'no-store',
        body: '{}',
      })
      const body = await response.json().catch(() => null)
      if (body === null || body.ok !== true) {
        throw new Error((body && body.error) || `HTTP ${response.status}`)
      }
      return body.data
    }

    /** Poll /status until the new process mounts the route again. */
    async function waitForServer(timeoutMs) {
      const started = Date.now()
      await sleep(1200)
      while (Date.now() - started < timeoutMs) {
        try {
          const response = await fetch('/dsh-restart/api/status', { cache: 'no-store' })
          if (response.ok) {
            const body = await response.json().catch(() => null)
            if (body !== null && body.ok === true) return true
          }
        } catch {
          // Connection refused during shutdown/startup is expected.
        }
        await sleep(1000)
      }
      return false
    }

    function makeButton(t) {
      return function RestartButton(props) {
        const wide = props?.wide === true
        const [visible, setVisible] = useButtonVisible()
        const [phase, setPhase] = React.useState('idle')
        const [message, setMessage] = React.useState('')

        const run = React.useCallback(async () => {
          if (phase === 'busy' || phase === 'restarting') return
          setPhase('busy')
          setMessage('')
          try {
            await postRestart()
            setPhase('restarting')
            const back = await waitForServer(120000)
            if (back) {
              window.location.reload()
              return
            }
            setPhase('error')
            setMessage(t('timeout'))
          } catch (error) {
            setPhase('error')
            setMessage(t('failed', { message: String(error?.message ?? error) }))
          }
        }, [phase, t])

        const busy = phase === 'busy' || phase === 'restarting'
        const label = phase === 'error' ? t('retry') : t('action')
        const title = phase === 'error' ? `${t('action')} — ${message}` : busy ? t(phase) : t('action')

        if (!visible) {
          // Collapsed restore affordance: keeps sidebar geometry, restores the
          // button when clicked. Still part of the user-button stack.
          const restoreTitle = t('toggleShow')
          return h(
            'button',
            {
              type: 'button',
              className: 'dsh-restart-btn',
              'data-plugin': NS,
              'data-state': 'hidden',
              'data-narrow': wide ? 'false' : 'true',
              title: restoreTitle,
              'aria-label': restoreTitle,
              onClick: () => setVisible(true),
            },
            h('span', { className: 'dsh-restart-icon' }, h(EyeIcon, { hidden: true })),
            wide ? h('span', null, restoreTitle) : null,
          )
        }

        const toggleTitle = t('toggleHide')
        return h(
          'div',
          { className: 'dsh-restart-row', 'data-plugin': NS },
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-restart-btn',
              'data-state': phase,
              'data-narrow': wide ? 'false' : 'true',
              title,
              'aria-label': title,
              disabled: busy,
              onClick: () => {
                void run()
              },
            },
            h(
              'span',
              { className: busy ? 'dsh-restart-icon dsh-restart-spin' : 'dsh-restart-icon' },
              h(RestartIcon),
            ),
            wide ? h('span', null, label) : null,
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-restart-toggle',
              title: toggleTitle,
              'aria-label': toggleTitle,
              onClick: () => setVisible(false),
            },
            h(EyeIcon, { hidden: false }),
          ),
        )
      }
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.effect(() => {
          if (typeof document === 'undefined') return () => {}
          if (document.querySelector(`style[data-plugin="${NS}"]`) !== null) {
            return () => {}
          }
          const tag = document.createElement('style')
          tag.dataset.plugin = NS
          tag.textContent = CSS
          document.head.appendChild(tag)
          return () => {
            tag.remove()
          }
        }, 'dsh-restart-style')

        let translate = localTranslate
        try {
          const locale = ctx.locale
          if (locale && typeof locale.register === 'function') {
            ctx.effect(() => {
              const disposers = []
              try {
                disposers.push(locale.register(NS, 'zh', DICTS.zh))
              } catch {}
              try {
                disposers.push(locale.register(NS, 'en', DICTS.en))
              } catch {}
              return () => {
                for (const dispose of disposers) {
                  try {
                    dispose?.()
                  } catch {}
                }
              }
            }, 'dsh-restart-locale')
            const bound = locale.bind?.(NS)
            if (typeof bound === 'function') {
              translate = (key, vars) => {
                let text
                try {
                  text = bound(key, vars)
                } catch {
                  text = undefined
                }
                if (typeof text !== 'string' || text === key) return localTranslate(key, vars)
                return text
              }
            }
          }
        } catch {
          translate = localTranslate
        }

        const Button = makeButton(translate)

        // Slot order: footer.action renders above settings in the sidebar foot.
        ctx.slots.inject('sidebar.footer.action', () =>
          ctx.slots.register(
            {
              name: 'sidebar.footer.action',
              id: 'dsh-restart',
              order: 100,
              label: () => translate('action'),
            },
            Button,
          ),
        )

      },
    }
  },
})
