import { create } from 'zustand'

/** 帮助与反馈弹窗；设置里打开 */
export const useHelpDialog = create(() => ({ open: false }))

export const openHelp = () => useHelpDialog.setState({ open: true })

export const closeHelp = () => useHelpDialog.setState({ open: false })
