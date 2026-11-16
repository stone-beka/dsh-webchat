import { create } from 'zustand'

/** 首次使用说明是否已看过 */
const SEEN_KEY = 'chat-demo:about-seen'

/** 首次使用说明弹窗的开合；「设置 → 通用设置」里可以再次打开 */
export const useAboutDialog = create(() => ({ open: false }))

/** 只读一次本地记录：存储不可用时当作没看过，每次打开都提示一遍 */
export const hasSeenAbout = (): boolean => {
  try {
    return localStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return false
  }
}

const markSeen = () => {
  try {
    localStorage.setItem(SEEN_KEY, '1')
  } catch {
    // 存储不可用就不记，只影响是否重复提示
  }
}

export const openAbout = () => useAboutDialog.setState({ open: true })

/** 关闭即记为看过，这一页的说明只在真正没看过时自动弹一次 */
export const closeAbout = () => {
  markSeen()
  useAboutDialog.setState({ open: false })
}
