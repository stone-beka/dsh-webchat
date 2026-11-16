import { translate } from '../../i18n/index.js'
import { monthKey } from '../../utils/format.js'
import type { SessionSummary } from './types.js'

const DAY = 86_400_000

const startOfDay = (time: number) => new Date(time).setHours(0, 0, 0, 0)

/**
 * 分组：置顶 / 今天 / 昨天 / 7 天内 / 30 天内 / 按月；置顶的会话不再出现在时间分组里。
 * @param sessions - 会话摘要。
 * @param now - 当前时间，用于算相对分组。
 * @param t - 翻译函数。
 * @param pinOrder - 置顶的手动顺序（会话 id）；不在列表里的按更新时间排在后面。
 */
export const groupSessions = (
  sessions: SessionSummary[],
  now: number,
  t = translate,
  pinOrder: readonly string[] = []
) => {
  const groups: { key: string; label: string; sessions: SessionSummary[] }[] = []
  const rank = new Map(pinOrder.map((id, index) => [id, index]))
  const pinned = sessions
    .filter((session) => session.pinned === true)
    .sort((a, b) => {
      const rankA = rank.get(a.id) ?? Number.MAX_SAFE_INTEGER
      const rankB = rank.get(b.id) ?? Number.MAX_SAFE_INTEGER
      return rankA === rankB ? b.updatedAt - a.updatedAt : rankA - rankB
    })
  if (pinned.length > 0) {
    groups.push({
      key: 'sessionHistoryTimelineLabelPinned',
      label: t('sessionHistoryTimelineLabelPinned'),
      sessions: pinned,
    })
  }
  for (const session of sessions) {
    if (session.pinned === true) {
      continue
    }
    const diff = Math.floor((now - startOfDay(session.updatedAt)) / DAY)
    const key =
      diff <= 0
        ? 'sessionHistoryTimelineLabelToday'
        : diff <= 1
          ? 'sessionHistoryTimelineLabelYesterday'
          : diff < 7
            ? 'sessionHistoryTimelineLabel7days'
            : diff < 30
              ? 'sessionHistoryTimelineLabel30days'
              : null
    const groupKey = key ?? monthKey(session.updatedAt) ?? ''
    const last = groups.at(-1)
    if (last?.key === groupKey) {
      last.sessions.push(session)
    } else {
      groups.push({ key: groupKey, label: key ? t(key) : groupKey, sessions: [session] })
    }
  }
  return groups
}
