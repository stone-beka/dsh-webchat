import { useEffect, useRef, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { messagesToReveal } from '../../services/chat/revealPath.js'
import { selectMessageVersion, selectSession, useChatStore } from '../../services/chat/store.js'
import { requestMessageFocus } from '../../services/messageFocus.js'
import { buildSearchIndex, searchIndex, type SearchHit, type SearchResult } from '../../services/search/sessionSearch.js'
import { IconCloseOutline16, IconSearchOutline16 } from '../base/icons.js'
import { IconButton } from '../base/IconButton.js'
import { closeSessionSearch, useSessionSearch } from './sessionSearchState.js'
import styles from './SessionSearchDialog.module.css'

const EMPTY: SearchResult = { titleHits: [], messageHits: [] }

/** 搜索对话内容：标题命中 + 消息命中，点一条跳到那条消息（必要时先切回它的分支） */
export const SessionSearchDialog = () => {
  const open = useSessionSearch((state) => state.open)
  return open ? <SearchContent /> : null
}

const SearchContent = () => {
  const t = useTranslate()
  const [query, setQuery] = useState('')
  const [typed, setTyped] = useState('')
  const [progress, setProgress] = useState<{ done: number; total: number } | null>({
    done: 0,
    total: 0,
  })
  const [result, setResult] = useState<SearchResult>(EMPTY)
  const [ready, setReady] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // 第一次打开时建立索引；之后的输入只在内存里过滤
  useEffect(() => {
    let cancelled = false
    void buildSearchIndex((done, total) => {
      if (!cancelled) {
        setProgress({ done, total })
      }
    }).then(() => {
      if (!cancelled) {
        setProgress(null)
        setReady(true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // 输入防抖 120ms，避免每个按键都扫一遍千级会话
  useEffect(() => {
    const timer = setTimeout(() => setTyped(query), 120)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    setResult(ready && typed.trim().length > 0 ? searchIndex(typed) : EMPTY)
  }, [typed, ready])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeSessionSearch()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const close = () => closeSessionSearch()

  const openHit = async (hit: SearchHit) => {
    close()
    selectSession(hit.sessionId)
    if (hit.messageId === undefined) {
      return
    }
    // selectSession 是异步加载：等它进 store 之后再切分支、定位消息
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const session = useChatStore.getState().sessionCache[hit.sessionId]
      if (session !== undefined) {
        if (session.messages.some((message) => message.id === hit.messageId)) {
          for (const id of messagesToReveal(session, hit.messageId)) {
            selectMessageVersion(session.id, id)
          }
          requestMessageFocus(hit.messageId)
        }
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }

  const firstHit = result.titleHits[0] ?? result.messageHits[0]
  const empty = typed.trim().length > 0 && result.titleHits.length === 0 && result.messageHits.length === 0

  return (
    <div
      className={styles.overlay}
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <div className={styles.panel} role="dialog" aria-modal="true" aria-label={t('sessionSearchOpen')}>
        <div className={styles.field}>
          <span className={styles.fieldIcon}>
            <IconSearchOutline16 />
          </span>
          <input
            ref={inputRef}
            className={styles.input}
            value={query}
            placeholder={t('sessionSearchPlaceholder')}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && firstHit !== undefined) {
                event.preventDefault()
                void openHit(firstHit)
              }
            }}
          />
          <IconButton
            className={styles.close}
            tone="primary"
            icon={<IconCloseOutline16 />}
            aria-label={t('close')}
            onClick={close}
          />
        </div>
        <div className={styles.results}>
          {progress !== null && progress.total > 0 ? (
            <div className={styles.state}>
              {t('sessionSearchIndexing', { done: progress.done, total: progress.total })}
            </div>
          ) : null}
          {empty && progress === null ? <div className={styles.state}>{t('sessionSearchEmpty')}</div> : null}
          {result.titleHits.length > 0 ? (
            <section className={styles.group}>
              <h4 className={styles.heading}>{t('sessionSearchTitleGroup')}</h4>
              {result.titleHits.map((hit) => (
                <button
                  key={`title-${hit.sessionId}`}
                  type="button"
                  className={styles.hit}
                  onClick={() => void openHit(hit)}
                >
                  <span className={styles.hitTitle}>{hit.title || t('untitledChat')}</span>
                </button>
              ))}
            </section>
          ) : null}
          {result.messageHits.length > 0 ? (
            <section className={styles.group}>
              <h4 className={styles.heading}>{t('sessionSearchMessageGroup')}</h4>
              {result.messageHits.map((hit) => (
                <button
                  key={`${hit.sessionId}-${hit.messageId ?? ''}`}
                  type="button"
                  className={styles.hit}
                  onClick={() => void openHit(hit)}
                >
                  <span className={styles.hitLine}>
                    <span className={styles.hitTitle}>{hit.title || t('untitledChat')}</span>
                    <span className={styles.hitRole}>
                      {hit.role === 'user'
                        ? t('branchTreeRoleUser')
                        : t('branchTreeRoleAssistant')}
                    </span>
                  </span>
                  <span className={styles.hitSnippet}>{hit.snippet}</span>
                </button>
              ))}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  )
}
