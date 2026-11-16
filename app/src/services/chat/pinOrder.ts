import { create } from 'zustand'

/**
 * 置顶组的手动顺序：只存 id 列表，会话本身仍以 `pinned` 标记为准。
 * 存 localStorage 而不进 IndexedDB，是为了不动物件结构和官方导出格式。
 */
const KEY = 'chat-demo:pin-order'

const read = (): string[] => {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed: unknown = raw === null ? [] : JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

const write = (ids: string[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids))
  } catch {
    // 存储不可用时顺序只在内存里生效
  }
}

/** ids 变化会触发侧栏重排 */
export const usePinOrder = create(() => ({ ids: read() }))

export const savePinOrder = (ids: string[]) => {
  write(ids)
  usePinOrder.setState({ ids })
}

/** 新置顶的排在最后 */
export const rememberPin = (id: string) => {
  savePinOrder([...usePinOrder.getState().ids.filter((item) => item !== id), id])
}

export const forgetPin = (id: string) => {
  savePinOrder(usePinOrder.getState().ids.filter((item) => item !== id))
}
