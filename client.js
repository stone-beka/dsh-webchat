/**
 * Browser half of the dsh-webchat bundle.
 *
 * One global main-column panel embeds the build that the Host serves from disk
 * (`http://127.0.0.1:43117/`), and one `sidebar.panellist` icon selects it.
 *
 * The page is a chat-only application: it talks to `api.deepseek.com` with the
 * key you enter in its own Settings, keeps its conversations in its own browser
 * storage, and has no tools and no side effects — which is why editing an
 * earlier message and branching from it are honest there. Nothing here reads or
 * writes DSH session data, and the key never reaches the Host.
 */
window.__ModuleLoader__.load({
  id: 'dsh-webchat',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Locale namespace owned by this plugin. */
    const NS = 'dshWebchat'

    /** Panel id shared by the sidebar entry and the main-column panel. */
    const PANEL_ID = 'dsh-webchat'

    /** The locally served build; it must match PORT in index.js. */
    const SOURCE = 'http://127.0.0.1:43117/'

    /**
     * The build's first-run defaults follow this host: the pinned build reads
     * `seed-theme` / `seed-locale` only while it has never saved that setting,
     * so a choice made inside the page always wins afterwards.
     * @returns the iframe source with the host's current theme and language.
     */
    function sourceUrl() {
      let theme = 'light'
      let locale = 'en-US'
      try {
        theme = document.body?.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light'
        const lang = (document.documentElement.lang || '').toLowerCase()
        locale = lang.startsWith('zh') ? 'zh-CN' : 'en-US'
      } catch {
        // A document without these markers keeps the build's own defaults.
      }
      return `${SOURCE}?seed-theme=${theme}&seed-locale=${locale}`
    }

    const zh = {
      panel: 'DSH WebChat',
      title: 'DSH WebChat',
      loading: '正在加载 DSH WebChat…',
      slow: '本地页面没起来：DSH WebChat 的本地服务（127.0.0.1:43117）没有运行，或端口被别的程序占用。看插件说明里的排查步骤。',
    }
    const en = {
      panel: 'DSH WebChat',
      title: 'DSH WebChat',
      loading: 'Loading the local DSH WebChat build…',
      slow: 'The local page did not load: the local server for DSH WebChat (127.0.0.1:43117) is not running, or something else holds that port. See the plugin description for how to check.',
    }

    /**
     * The embedded application, sized to the main column.
     * @param props - slot props, including the locale-bound `t`.
     * @returns the panel element.
     */
    function DshWebChatPanel(props) {
      const t = props.t
      const [ready, setReady] = React.useState(false)
      const [slow, setSlow] = React.useState(false)
      // Resolved once per mount: a host theme change must not reload the page.
      const src = React.useMemo(sourceUrl, [])
      const onLoad = React.useCallback(() => { setReady(true) }, [])
      React.useEffect(() => {
        if (ready || slow) return undefined
        const timer = setTimeout(() => { setSlow(true) }, 12000)
        return () => { clearTimeout(timer) }
      }, [ready, slow])
      const overlay = !ready ? h('div', {
        style: {
          position: 'absolute',
          inset: 0,
          zIndex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          pointerEvents: 'none',
        },
      }, h('div', {
        style: {
          maxWidth: 'min(78%, 460px)',
          boxSizing: 'border-box',
          padding: '10px 14px',
          borderRadius: 10,
          background: 'var(--dsw-alias-bg-base)',
          color: 'inherit',
          fontSize: 'var(--dsh-content-font-size, 13px)',
          lineHeight: 1.6,
          textAlign: 'center',
          overflowWrap: 'anywhere',
          pointerEvents: slow ? 'auto' : 'none',
          userSelect: 'text',
        },
      }, slow ? t('slow') : t('loading'))) : null
      return h('div', {
        style: {
          position: 'relative',
          display: 'flex',
          flex: '1 1 auto',
          width: '100%',
          minHeight: 0,
          background: 'var(--dsw-alias-bg-base)',
        },
      },
      h('iframe', {
        src,
        title: t('title'),
        onLoad,
        allow: 'clipboard-write; microphone; autoplay; fullscreen',
        style: {
          flex: '1 1 auto',
          display: 'block',
          width: '100%',
          height: '100%',
          border: '0',
        },
      }),
      overlay)
    }

    /** The sidebar glyph; the sidebar owns the button, label, and selected state. */
    function DshWebChatIcon(props) {
      const size = props.size
      return h('svg', {
        viewBox: '5.5 6.5 25 25',
        width: size,
        height: size,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2.2,
        strokeLinejoin: 'round',
        'aria-hidden': true,
        style: { display: 'block' },
      },
      h('path', {
        d: 'M11.5 9H24.5A4.5 4.5 0 0 1 29 13.5V21A4.5 4.5 0 0 1 24.5 25.5H16.5L11.5 30V25.5A4.5 4.5 0 0 1 7 21V13.5A4.5 4.5 0 0 1 11.5 9Z',
      }),
      h('path', {
        d: 'M16.4 14.1L21.3 17.25L16.4 20.4Z',
        fill: 'currentColor',
        stroke: 'none',
      }))
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-webchat: dictionaries')
        const t = ctx.locale.bind(NS)
        ctx.effect(() => {
          const disposePanel = ctx.slots.inject('main', () => ctx.slots.register({
            name: 'main',
            key: PANEL_ID,
            locale: NS,
          }, DshWebChatPanel))
          const disposeEntry = ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
            name: 'sidebar.panellist',
            id: PANEL_ID,
            order: 10,
            label: () => t('panel'),
            locale: NS,
          }, DshWebChatIcon))
          return () => {
            disposeEntry()
            disposePanel()
          }
        }, 'dsh-webchat: panel and sidebar entry')
      },
    }
  },
})
