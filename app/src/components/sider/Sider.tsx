import clsx from 'clsx'
import { useEffect, useMemo, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import {
  IconPanelLeftOutline16,
  IconSearchOutline16,
  IconSettingsOutline16,
  NewChatIcon,
} from '../base/icons.js'
import { setSiderCollapsed } from '../../services/settings.js'
import { groupSessions } from '../../services/chat/sessionGroups.js'
import { forgetPin, savePinOrder, usePinOrder } from '../../services/chat/pinOrder.js'
import { newChat, removeSession, setSessionPinned, useChatStore } from '../../services/chat/store.js'
import type { SessionSummary } from '../../services/chat/types.js'
import { Button } from '../base/Button.js'
import { IconButton } from '../base/IconButton.js'
import { Modal } from '../base/Modal.js'
import { showToast } from '../base/toastState.js'
import { openSettings } from '../settings/settingsDialogState.js'
import { openSessionSearch } from '../sessionSearch/sessionSearchState.js'
import { closeMobileSider, useMobileSider } from './mobileSiderState.js'
import { SessionItem } from './SessionItem.js'
import styles from './Sider.module.css'

const PINNED_KEY = 'sessionHistoryTimelineLabelPinned'

/** 展开的侧边栏：名称与收起按钮、开启新对话、按时间分组的会话列表、底部设置；移动端放在抽屉里，收起按钮关闭抽屉 */
export const Sider = ({ mobile = false }: { mobile?: boolean }) => {
  const t = useTranslate()
  const sessions = useChatStore((state) => state.sessions)
  const activeId = useChatStore((state) => state.activeId)
  const pinOrder = usePinOrder((state) => state.ids)
  const [now, setNow] = useState(Date.now)
  const groups = useMemo(
    () => groupSessions(sessions, now, t, pinOrder),
    [sessions, now, t, pinOrder]
  )
  const [deleting, setDeleting] = useState<SessionSummary | null>(null)
  const [deletePending, setDeletePending] = useState(false)
  // 多选：整行勾选，底部换成分批操作栏
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())
  const [batchDeleting, setBatchDeleting] = useState(false)
  const [batchBusy, setBatchBusy] = useState(false)
  // 置顶排序：置顶组里逐行上移/下移
  const [pinSort, setPinSort] = useState(false)

  const pinnedSessions = groups[0]?.key === PINNED_KEY ? groups[0].sessions : []
  const allIds = sessions.map((session) => session.id)

  const exitSelect = () => {
    setSelecting(false)
    setSelected(new Set())
  }

  const toggleSelect = (id: string) => {
    setSelected((previous) => {
      const next = new Set(previous)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const batchPin = (pinned: boolean) => {
    for (const id of selected) {
      setSessionPinned(id, pinned)
    }
    showToast({
      key: pinned ? 'sessionsPinnedToast' : 'sessionsUnpinnedToast',
      params: { count: selected.size },
    })
    exitSelect()
  }

  const movePin = (index: number, delta: number) => {
    const ids = pinnedSessions.map((session) => session.id)
    const target = index + delta
    if (target < 0 || target >= ids.length) {
      return
    }
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    savePinOrder(ids)
  }

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const refresh = () => {
      clearTimeout(timer)
      const time = Date.now()
      setNow(time)
      const midnight = new Date(time).setHours(24, 0, 0, 0)
      timer = setTimeout(refresh, midnight - time)
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refresh()
      }
    }
    refresh()
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', refresh)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', refresh)
    }
  }, [])

  return (
    <div className={clsx(styles.sider, mobile && styles.mobile)}>
      <div className={styles.top}>
        <div className={styles.appName}>{t('appName')}</div>
        <IconButton
          size="m"
          icon={<IconSearchOutline16 />}
          tooltip={t('sessionSearchOpen')}
          tooltipPlacement="bottom"
          onClick={openSessionSearch}
        />
        <IconButton
          size="m"
          icon={<IconPanelLeftOutline16 />}
          tooltip={t('collapseSiderbarButton')}
          tooltipPlacement="bottom"
          onClick={() => (mobile ? closeMobileSider() : setSiderCollapsed(true))}
        />
      </div>
      <button
        type="button"
        className={styles.newChat}
        onClick={() => {
          newChat()
          closeMobileSider()
        }}
      >
        <span className={styles.newChatIcon}>
          <NewChatIcon />
        </span>
        {t('newChat')}
      </button>
      <div className={styles.listWrap}>
        <div className={styles.list}>
          {groups.map((group) => {
            const sortable = group.key === PINNED_KEY && group.sessions.length > 1
            return (
              <div key={group.key} className={styles.section}>
                <div className={styles.sectionHeader}>
                  <span className={styles.sectionLabel}>{group.label}</span>
                  {sortable ? (
                    <button
                      type="button"
                      className={clsx(styles.sortToggle, pinSort && styles.sortToggleOn)}
                      onClick={() => setPinSort((value) => !value)}
                    >
                      {pinSort ? t('sessionPinnedSortDone') : t('sessionPinnedSort')}
                    </button>
                  ) : null}
                </div>
                {group.sessions.map((session, index) => (
                  <SessionItem
                    key={session.id}
                    session={session}
                    active={session.id === activeId}
                    onDelete={() => setDeleting(session)}
                    selecting={selecting}
                    selected={selected.has(session.id)}
                    onToggleSelect={() => toggleSelect(session.id)}
                    onStartSelect={() => setSelecting(true)}
                    onMovePin={
                      pinSort && group.key === PINNED_KEY
                        ? (delta) => movePin(index, delta)
                        : undefined
                    }
                  />
                ))}
              </div>
            )
          })}
        </div>
      </div>
      {selecting ? (
        <div className={styles.batch}>
          <div className={styles.batchRow}>
            <button
              type="button"
              className={styles.batchAction}
              onClick={() =>
                setSelected(selected.size === allIds.length ? new Set() : new Set(allIds))
              }
            >
              {selected.size === allIds.length ? t('sessionSelectClear') : t('sessionSelectAll')}
            </button>
            <span className={styles.batchCount}>
              {t('sessionSelectCount', { count: selected.size })}
            </span>
            <button type="button" className={styles.batchAction} onClick={exitSelect}>
              {t('cancel')}
            </button>
          </div>
          <div className={styles.batchRow}>
            <button
              type="button"
              className={styles.batchAction}
              disabled={selected.size === 0}
              onClick={() => batchPin(true)}
            >
              {t('sessionItemMenuPinOption')}
            </button>
            <button
              type="button"
              className={styles.batchAction}
              disabled={selected.size === 0}
              onClick={() => batchPin(false)}
            >
              {t('sessionItemMenuUnpinOption')}
            </button>
            <button
              type="button"
              className={clsx(styles.batchAction, styles.batchDanger)}
              disabled={selected.size === 0}
              onClick={() => setBatchDeleting(true)}
            >
              {t('delete')}
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.bottom}>
          <button type="button" className={styles.settings} onClick={() => openSettings('general')}>
            <span className={styles.settingsIcon}>
              <IconSettingsOutline16 />
            </span>
            <span className={styles.settingsLabel}>{t('settings')}</span>
          </button>
        </div>
      )}
      {deleting ? (
        <Modal
          title={t('deleteSessionModalContentTitle')}
          onClose={() => {
            if (!deletePending) {
              setDeleting(null)
            }
          }}
          footer={
            <>
              <Button variant="outlined" disabled={deletePending} onClick={() => setDeleting(null)}>
                {t('cancel')}
              </Button>
              <Button
                variant="danger"
                disabled={deletePending}
                onClick={async () => {
                  setDeletePending(true)
                  try {
                    if (await removeSession(deleting.id)) {
                      forgetPin(deleting.id)
                      setDeleting(null)
                    } else {
                      showToast({ key: 'sessionDeleteFailed', type: 'error' })
                    }
                  } finally {
                    setDeletePending(false)
                  }
                }}
              >
                {t('delete')}
              </Button>
            </>
          }
        >
          {t('deleteSessionWithFilesDescription')}
        </Modal>
      ) : null}
      {batchDeleting ? (
        <Modal
          title={t('sessionSelectDeleteTitle')}
          onClose={() => {
            if (!batchBusy) {
              setBatchDeleting(false)
            }
          }}
          footer={
            <>
              <Button variant="outlined" disabled={batchBusy} onClick={() => setBatchDeleting(false)}>
                {t('cancel')}
              </Button>
              <Button
                variant="danger"
                disabled={batchBusy}
                onClick={async () => {
                  setBatchBusy(true)
                  let failed = false
                  try {
                    for (const id of [...selected]) {
                      if (await removeSession(id)) {
                        forgetPin(id)
                      } else {
                        failed = true
                      }
                    }
                  } finally {
                    setBatchBusy(false)
                    setBatchDeleting(false)
                    if (failed) {
                      showToast({ key: 'sessionDeleteFailed', type: 'error' })
                    } else {
                      exitSelect()
                    }
                  }
                }}
              >
                {t('delete')}
              </Button>
            </>
          }
        >
          {t('sessionSelectDeleteDescription', { count: selected.size })}
        </Modal>
      ) : null}
    </div>
  )
}

/** 移动端抽屉：浮在页面上方，点空白区域关闭。 */
export const MobileSider = () => {
  const open = useMobileSider((state) => state.open)
  if (!open) {
    return null
  }
  return (
    <>
      <div className={styles.drawerMask} onClick={closeMobileSider} />
      <div className={styles.drawer}>
        <Sider mobile />
      </div>
    </>
  )
}
