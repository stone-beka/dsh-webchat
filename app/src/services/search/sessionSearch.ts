import { normalizeSession } from '../chat/branches.js'
import { loadSession, loadSessionSummaries } from '../chat/db.js'
import type { Message, SessionSummary } from '../chat/types.js'

/** 一条命中：标题命中没有 `messageId`；消息命中带片段与角色。 */
export type SearchHit = {
  sessionId: string
  title: string
  updatedAt: number
  messageId?: string
  role?: 'user' | 'assistant'
  snippet?: string
}

export type SearchResult = {
  titleHits: SearchHit[]
  messageHits: SearchHit[]
}

type IndexedSession = {
  summary: SessionSummary
  messages: { id: string; role: 'user' | 'assistant'; text: string }[]
}

/** 索引只留在内存：刷新页面后重建；只重读有变化的会话。 */
const cache = new Map<string, IndexedSession>()

const textOf = (message: Message): string =>
  message.role === 'user'
    ? message.content
    : message.blocks.map((block) => (block.type === 'text' ? block.text : '')).join('\n')

/**
 * 建立或增量更新内存索引。
 *
 * 只重读 `updatedAt` 变化过的会话，所以聊过天之后再打开搜索不会全量重扫；
 * 会话被删除时同步丢弃缓存。
 * @param onProgress - 每处理完一个会话回调一次，用于显示进度。
 */
export const buildSearchIndex = async (
  onProgress?: (done: number, total: number) => void
): Promise<void> => {
  const summaries = await loadSessionSummaries()
  const total = summaries.length
  const alive = new Set(summaries.map((summary) => summary.id))
  for (const id of [...cache.keys()]) {
    if (!alive.has(id)) {
      cache.delete(id)
    }
  }
  let done = 0
  for (const summary of summaries) {
    const cached = cache.get(summary.id)
    if (cached === undefined || cached.summary.updatedAt !== summary.updatedAt) {
      const session = await loadSession(summary.id).catch(() => undefined)
      if (session !== undefined) {
        cache.set(summary.id, {
          summary,
          // 索引全部消息而不只是当前可见分支：被放弃的分支也能搜到，
          // 点开时由 messagesToReveal 先切回那条分支。
          messages: normalizeSession(session).messages.map((message) => ({
            id: message.id,
            role: message.role,
            text: textOf(message),
          })),
        })
      }
    }
    done += 1
    onProgress?.(done, total)
  }
}

const snippetAround = (text: string, at: number, length: number): string => {
  const start = Math.max(0, at - 24)
  const end = Math.min(text.length, at + length + 72)
  const body = text.slice(start, end).replace(/\s+/g, ' ').trim()
  return `${start > 0 ? '…' : ''}${body}${end < text.length ? '…' : ''}`
}

const LIMIT = { titles: 12, messages: 40 }

/**
 * 在索引里查：大小写不敏感，空格分词后要求全部命中。
 * @param query - 用户输入。
 * @returns 标题命中与消息命中，按会话更新时间倒序。
 */
export const searchIndex = (query: string): SearchResult => {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 0)
  if (terms.length === 0) {
    return { titleHits: [], messageHits: [] }
  }
  const sessions = [...cache.values()].sort((a, b) => b.summary.updatedAt - a.summary.updatedAt)
  const titleHits: SearchHit[] = []
  const messageHits: SearchHit[] = []
  for (const indexed of sessions) {
    const title = indexed.summary.title || ''
    const lowerTitle = title.toLowerCase()
    const titleMatched = terms.every((term) => lowerTitle.includes(term))
    if (titleMatched && titleHits.length < LIMIT.titles) {
      titleHits.push({ sessionId: indexed.summary.id, title, updatedAt: indexed.summary.updatedAt })
    }
    if (titleMatched) {
      // 标题已经命中就够用了：整条会话在标题组里可见，不再逐条列消息。
      continue
    }
    for (const message of indexed.messages) {
      const lower = message.text.toLowerCase()
      let at = -1
      let matched = true
      for (const term of terms) {
        const index = lower.indexOf(term)
        if (index < 0) {
          matched = false
          break
        }
        if (at < 0 || index < at) {
          at = index
        }
      }
      if (!matched) {
        continue
      }
      messageHits.push({
        sessionId: indexed.summary.id,
        title,
        updatedAt: indexed.summary.updatedAt,
        messageId: message.id,
        role: message.role,
        snippet: snippetAround(message.text, at, terms[0].length),
      })
      if (messageHits.length >= LIMIT.messages) {
        break
      }
    }
    if (messageHits.length >= LIMIT.messages) {
      break
    }
  }
  return { titleHits, messageHits }
}
