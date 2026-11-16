import { getVisibleMessages, normalizeSession } from './branches.js'
import type { Session } from './types.js'

/**
 * 从当前显示的分支切换到某条消息，需要依次选中的消息 id（从根往下的顺序）。
 *
 * 会话 store 的 `selectMessageVersion` 只允许切换"父节点在当前路径上"的消息，
 * 所以要点开另一条分支深处的消息，必须沿祖先链逐层切换：每切一层，
 * 下一层的父节点就进入可见路径。已经可见的消息不需要再切。
 * @param session - 当前会话。
 * @param targetId - 想跳到的那条消息。
 * @returns 需要按顺序传给 selectMessageVersion 的 id；已经在路径上时为空数组。
 */
export const messagesToReveal = (session: Session, targetId: string): string[] => {
  const normalized = normalizeSession(session)
  const byId = new Map(normalized.messages.map((message) => [message.id, message]))
  if (!byId.has(targetId)) {
    return []
  }
  const visible = new Set(getVisibleMessages(normalized).map((message) => message.id))
  const chain: string[] = []
  let current: string | null = targetId
  const guard = new Set<string>()
  while (current !== null) {
    if (guard.has(current)) {
      break
    }
    guard.add(current)
    const message = byId.get(current)
    if (!message) {
      break
    }
    chain.unshift(current)
    current = message.parentId ?? null
  }
  return chain.filter((id) => !visible.has(id))
}
