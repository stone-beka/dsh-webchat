import clsx from 'clsx'
import { memo, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import {
  IconCheckOutline16,
  IconChevronDownOutline14,
  IconDownloadOutline16,
  IconEditOutline16,
  IconEllipsisOutline16,
  IconPinOutline16,
  IconTrashOutline16,
} from '../base/icons.js'
import { exportSessionShare } from '../../services/chat/share.js'
import { showToast } from '../base/toastState.js'
import { renameSession, selectSession, setSessionPinned } from '../../services/chat/store.js'
import type { SessionSummary } from '../../services/chat/types.js'
import { IconButton } from '../base/IconButton.js'
import { Menu } from '../base/Menu.js'
import { closeMobileSider } from './mobileSiderState.js'
import styles from './SessionItem.module.css'

export const SessionItem = memo(function SessionItem({
  session,
  active,
  onDelete,
  selecting = false,
  selected = false,
  onToggleSelect,
  onStartSelect,
  onMovePin,
}: {
  session: SessionSummary
  active: boolean
  onDelete: () => void
  /** 多选模式：整行变成勾选，不再切换会话 */
  selecting?: boolean
  selected?: boolean
  onToggleSelect?: () => void
  /** 会话菜单里的「多选」入口 */
  onStartSelect?: () => void
  /** 置顶排序模式：传了就显示上移/下移，替代会话菜单 */
  onMovePin?: (delta: number) => void
}) {
  const t = useTranslate()
  const [editing, setEditing] = useState(false)
  const displayTitle = session.title || t('untitledChat')

  if (editing) {
    const finish = (title: string) => {
      setEditing(false)
      if (title.trim() && title.trim() !== displayTitle) {
        renameSession(session.id, title.trim())
      }
    }
    return (
      <input
        className={styles.renameInput}
        defaultValue={displayTitle}
        autoFocus
        onFocus={(event) => event.target.select()}
        onBlur={(event) => finish(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            finish(event.currentTarget.value)
          } else if (event.key === 'Escape') {
            setEditing(false)
          }
        }}
      />
    )
  }

  const menu = [
    {
      key: 'rename',
      label: t('sessionItemMenuRenameOption'),
      icon: <IconEditOutline16 />,
      onSelect: () => setEditing(true),
    },
    {
      key: 'pin',
      label: session.pinned ? t('sessionItemMenuUnpinOption') : t('sessionItemMenuPinOption'),
      icon: <IconPinOutline16 />,
      onSelect: () => setSessionPinned(session.id, !session.pinned),
    },
    ...(onStartSelect === undefined
      ? []
      : [
          {
            key: 'select',
            label: t('sessionItemMenuSelectOption'),
            icon: <IconCheckOutline16 />,
            onSelect: onStartSelect,
          },
        ]),
    {
      key: 'export-md',
      label: t('sessionItemMenuExportMarkdown'),
      icon: <IconDownloadOutline16 />,
      onSelect: () => {
        void exportSessionShare(session.id, 'md').then((ok) => {
          if (!ok) {
            showToast({ key: 'historyExportFailed', type: 'error' })
          }
        })
      },
    },
    {
      key: 'export-html',
      label: t('sessionItemMenuExportHtml'),
      icon: <IconDownloadOutline16 />,
      onSelect: () => {
        void exportSessionShare(session.id, 'html').then((ok) => {
          if (!ok) {
            showToast({ key: 'historyExportFailed', type: 'error' })
          }
        })
      },
    },
    {
      key: 'delete',
      label: t('delete'),
      icon: <IconTrashOutline16 />,
      danger: true,
      onSelect: onDelete,
    },
  ]

  return (
    <div
      className={clsx(styles.item, active && styles.active, selecting && styles.selecting)}
      onClick={() => {
        if (selecting) {
          onToggleSelect?.()
          return
        }
        selectSession(session.id)
        closeMobileSider()
      }}
    >
      {selecting ? (
        <span className={clsx(styles.check, selected && styles.checkOn)} aria-hidden="true">
          {selected ? <IconCheckOutline16 /> : null}
        </span>
      ) : session.pinned ? (
        <span className={styles.pin} aria-hidden="true">
          <IconPinOutline16 />
        </span>
      ) : null}
      <div className={styles.title}>{displayTitle}</div>
      {selecting ? null : (
        <div
          className={clsx(styles.action, onMovePin !== undefined && styles.actionAlways)}
          onClick={(event) => event.stopPropagation()}
        >
          {onMovePin === undefined ? (
            <Menu options={menu}>
              {({ toggle }) => (
                <IconButton icon={<IconEllipsisOutline16 />} aria-label={t('more')} onClick={toggle} />
              )}
            </Menu>
          ) : (
            <div className={styles.move}>
              <IconButton
                size="xs"
                icon={
                  <span className={styles.flip}>
                    <IconChevronDownOutline14 />
                  </span>
                }
                aria-label={t('sessionPinnedMoveUp')}
                onClick={() => onMovePin(-1)}
              />
              <IconButton
                size="xs"
                icon={<IconChevronDownOutline14 />}
                aria-label={t('sessionPinnedMoveDown')}
                onClick={() => onMovePin(1)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
})
