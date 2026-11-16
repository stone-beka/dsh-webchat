/**
 * 让别处（分支图谱）能把消息列表滚动到某条消息。
 *
 * 分支图谱只能改会话状态，滚动发生在消息列表内部：请求先记在这里，
 * 消息列表在渲染后取走并滚到对应元素，所以即使目标元素还没渲染出来也不会丢。
 */
let pending: string | null = null
let listener: (() => void) | null = null

/** 请求把某条消息滚动到视口中间。 */
export const requestMessageFocus = (messageId: string): void => {
  pending = messageId
  listener?.()
}

/** 消息列表订阅请求；返回取消订阅的函数。 */
export const onMessageFocusRequest = (handler: () => void): (() => void) => {
  listener = handler
  return () => {
    if (listener === handler) {
      listener = null
    }
  }
}

/** 读取尚未处理的请求（不消费）。 */
export const peekMessageFocus = (): string | null => pending

/** 请求已处理，清空。 */
export const clearMessageFocus = (): void => {
  pending = null
}
