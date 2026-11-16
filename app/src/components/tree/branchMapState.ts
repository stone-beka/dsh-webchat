import { create } from 'zustand'

/**
 * 分支图谱的开关。
 *
 * 放在模块级 store 而不是 SessionView 的 useState 里：切换图谱时只重渲染
 * 按钮和面板本身，不会带着整条消息列表一起重渲染（那是开合卡顿的主因）。
 */
export const useBranchMap = create(() => ({ open: false }))

export const openBranchMap = () => useBranchMap.setState({ open: true })

export const closeBranchMap = () => useBranchMap.setState({ open: false })

export const toggleBranchMap = () => useBranchMap.setState((state) => ({ open: !state.open }))
