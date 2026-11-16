import { create } from 'zustand'

/** 搜索对话浮层的开合；侧栏搜索按钮与 Ctrl/Cmd+K 都能打开 */
export const useSessionSearch = create(() => ({ open: false }))

export const openSessionSearch = () => useSessionSearch.setState({ open: true })

export const closeSessionSearch = () => useSessionSearch.setState({ open: false })
