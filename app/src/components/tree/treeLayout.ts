import { getVisibleMessages, normalizeSession } from '../../services/chat/branches.js'
import type { Message, ReplyStatus, Session } from '../../services/chat/types.js'

/**
 * 树上的一个消息节点。
 *
 * 布局是真正的树形：根在顶部，父节点居中于它的子树。`depth` 决定第几行，
 * `slot` 是横向位置（叶子依次占 0、1、2…，父节点取子节点中点），
 * 具体像素尺寸由渲染组件按面板宽度算。
 */
export type TreeNode = {
  readonly id: string
  /** 纵向层号，决定第几行。 */
  readonly depth: number
  /** 横向位置，以"叶子槽位"为单位（可带小数）。 */
  readonly slot: number
  readonly role: Message['role']
  /** 是否位于当前显示的分支路径上。 */
  readonly onPath: boolean
  /**
   * 是否可以从这里切换分支：父节点在当前路径上（与会话 store 的切换规则一致）。
   * 历史里其他分支深处的节点不满足这个条件，只能看、不能直接跳。
   */
  readonly switchable: boolean
  /** 正文摘要，用于卡片正文与悬停提示。 */
  readonly snippet: string
  readonly createdAt: number
  /** 同一父节点下的版本总数（1 表示没有分叉）。 */
  readonly versions: number
  /** 自己在兄弟版本里的序号，从 0 开始。 */
  readonly versionIndex: number
  /** 是否为当前路径的末端节点。 */
  readonly current: boolean
  /** 是否有子节点（决定是否显示折叠控件）。 */
  readonly hasChildren: boolean

  /** 被折叠时隐藏的后代条数。 */
  readonly hiddenDescendants: number
  /** 是否处于折叠状态。 */
  readonly collapsed: boolean
  /** 回答才有：流式状态。 */
  readonly status?: ReplyStatus
  /** 回答才有：模型 id。 */
  readonly model?: string | null
  /** 回答才有：本轮输出 token 数。 */
  readonly outputTokens?: number
  /** 回答才有：请求时是否开启深度思考。 */
  readonly thinking?: boolean
  /** 回答才有：请求时是否开启联网搜索。 */
  readonly search?: boolean
}

/** 一条父子边。 */
export type TreeEdge = { readonly from: string; readonly to: string; readonly onPath: boolean }

export type TreeLayout = {
  readonly nodes: readonly TreeNode[]
  readonly edges: readonly TreeEdge[]
  /** 本次渲染的节点数。 */
  readonly count: number
  /** 分叉点数量（有多个子节点的父节点数）。 */
  readonly forks: number
  /** 被折叠隐藏的节点数。 */
  readonly hidden: number
  /** 层数（纵向行数）。 */
  readonly depths: number
  /** 叶子槽位数（横向宽度按它算）。 */
  readonly leaves: number
}

const snippetOf = (message: Message): string => {
  if (message.role === 'user') {
    return message.content.trim()
  }
  return message.blocks
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join(' ')
    .trim()
}

/**
 * 把会话的消息数组排成树：每个叶子的槽位依次递增，父节点落在首尾子节点的中点，
 * 于是每个分支都居中于自己的子树，整体呈树形而不是贴左边对齐。
 * 旧数据（没有 parentId）先按线性链规范化，和界面显示保持一致。
 * @param session - 当前会话。
 * @param collapsed - 被折叠的节点 id：它们的分支整段不渲染。
 * @returns 节点、边、统计与层/叶子数。
 */
export const layoutSessionTree = (
  session: Session,
  collapsed: ReadonlySet<string> = new Set()
): TreeLayout => {
  const normalized = normalizeSession(session)
  const children = new Map<string | null, Message[]>()
  for (const message of normalized.messages) {
    const key = message.parentId ?? null
    const bucket = children.get(key)
    if (bucket) {
      bucket.push(message)
    } else {
      children.set(key, [message])
    }
  }

  // 后代条数（含被折叠隐藏的），折叠标记上要显示它。
  const descendants = new Map<string, number>()
  const countDescendants = (message: Message, guard: Set<string>): number => {
    if (guard.has(message.id)) {
      return 0
    }
    guard.add(message.id)
    let total = 0
    for (const child of children.get(message.id) ?? []) {
      total += 1 + countDescendants(child, guard)
    }
    descendants.set(message.id, total)
    return total
  }
  for (const root of children.get(null) ?? []) {
    countDescendants(root, new Set())
  }

  const visiblePath = getVisibleMessages(normalized)
  const visible = new Set(visiblePath.map((message) => message.id))
  const currentId = visiblePath.length > 0 ? visiblePath[visiblePath.length - 1].id : null

  const nodes: TreeNode[] = []
  const edges: TreeEdge[] = []
  const seen = new Set<string>()
  let cursor = 0
  let maxDepth = 0
  let forks = 0
  let hidden = 0

  const record = (
    message: Message,
    depth: number,
    slot: number,
    siblings: readonly Message[],
    index: number,
    childCount: number,
    hiddenDescendants: number,
    isCollapsed: boolean
  ) => {
    const parentId = message.parentId ?? null
    const base = {
      id: message.id,
      depth,
      slot,
      role: message.role,
      onPath: visible.has(message.id),
      switchable: parentId === null || visible.has(parentId),
      snippet: snippetOf(message),
      createdAt: message.createdAt,
      versions: siblings.length,
      versionIndex: index,
      current: message.id === currentId,
      hasChildren: childCount > 0,
      hiddenDescendants,
      collapsed: isCollapsed,
    }
    if (message.role === 'assistant') {
      nodes.push({
        ...base,
        status: message.status,
        model: message.model,
        outputTokens: message.usage?.output_tokens,
        thinking: message.thinking === true,
        search: message.search === true,
      })
    } else {
      nodes.push(base)
    }
  }

  const visit = (
    message: Message,
    depth: number,
    siblings: readonly Message[],
    index: number
  ): number => {
    if (seen.has(message.id)) {
      return cursor
    }
    seen.add(message.id)
    maxDepth = Math.max(maxDepth, depth)
    const childList = children.get(message.id) ?? []
    const isCollapsed = collapsed.has(message.id)
    const hiddenHere = isCollapsed ? (descendants.get(message.id) ?? 0) : 0
    hidden += hiddenHere
    if (childList.length > 1) {
      forks += 1
    }

    // 叶子占一个新槽位；有子节点的取首尾子节点的中点，居中于自己的子树。
    if (isCollapsed || childList.length === 0) {
      const slot = cursor
      cursor += 1
      record(message, depth, slot, siblings, index, childList.length, hiddenHere, isCollapsed)
      return slot
    }

    childList.forEach((child) => {
      edges.push({
        from: message.id,
        to: child.id,
        onPath: visible.has(message.id) && visible.has(child.id),
      })
    })
    const childSlots = childList.map((child, childIndex) =>
      visit(child, depth + 1, childList, childIndex)
    )
    const slot = (childSlots[0] + childSlots[childSlots.length - 1]) / 2
    record(message, depth, slot, siblings, index, childList.length, hiddenHere, isCollapsed)
    return slot
  }

  const roots = children.get(null) ?? []
  roots.forEach((root, index) => {
    visit(root, 0, roots, index)
  })

  return {
    nodes,
    edges,
    count: nodes.length,
    forks,
    hidden,
    depths: nodes.length === 0 ? 0 : maxDepth + 1,
    leaves: nodes.length === 0 ? 0 : cursor,
  }
}
