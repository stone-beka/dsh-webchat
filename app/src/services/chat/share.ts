import { getVisibleMessages } from './branches.js'
import * as db from './db.js'
import type { Message, Session } from './types.js'

const textOf = (message: Message): string =>
  message.role === 'user'
    ? message.content
    : message.blocks.map((block) => (block.type === 'text' ? block.text : '')).join('\n\n')

const pad = (value: number): string => String(value).padStart(2, '0')

const stamp = (time: number): string => {
  const date = new Date(time)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const safeName = (title: string): string =>
  (title.trim() || 'chat').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60)

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/**
 * 会话 → Markdown：只导出当前可见分支，和界面上看到的一致。
 * @param session - 要导出的会话。
 */
export const sessionToMarkdown = (session: Session): string => {
  const messages = getVisibleMessages(session)
  const title = session.title.trim() || 'DSH WebChat'
  const lines: string[] = [
    `# ${title}`,
    '',
    `> 导出时间 ${stamp(Date.now())} · ${messages.length} 条消息 · DSH WebChat`,
    '',
  ]
  for (const message of messages) {
    lines.push(`**${message.role === 'user' ? '你' : 'DeepSeek'}** · ${stamp(message.createdAt)}`, '')
    lines.push(textOf(message).trim(), '', '---', '')
  }
  return lines.join('\n')
}

/**
 * 会话 → 单文件 HTML：样式内联，双击就能在浏览器里看，不依赖网络。
 * @param session - 要导出的会话。
 */
export const sessionToHtml = (session: Session): string => {
  const messages = getVisibleMessages(session)
  const title = session.title.trim() || 'DSH WebChat'
  const articles = messages
    .map(
      (message) => `    <article class="msg ${message.role}">
      <header>${message.role === 'user' ? '你' : 'DeepSeek'} <time>${stamp(message.createdAt)}</time></header>
      <div class="body">${escapeHtml(textOf(message))}</div>
    </article>`
    )
    .join('\n')
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 32px 16px 64px; font: 15px/1.7 system-ui, -apple-system, "Segoe UI", sans-serif; background: #f6f7f9; color: #1b1c1e; }
  main { max-width: 760px; margin: 0 auto; }
  h1 { font-size: 22px; line-height: 1.4; margin: 0 0 6px; }
  .meta { color: #6b7075; font-size: 13px; margin-bottom: 24px; }
  .msg { background: #fff; border-radius: 14px; padding: 14px 18px; margin-bottom: 12px; box-shadow: 0 1px 2px rgba(0,0,0,.05); }
  .msg.user { background: #eaf1ff; }
  .msg header { font-size: 12px; color: #6b7075; margin-bottom: 6px; }
  .msg header time { margin-left: 8px; opacity: .7; }
  .body { white-space: pre-wrap; overflow-wrap: anywhere; }
  @media (prefers-color-scheme: dark) {
    body { background: #14161a; color: #eceef2; }
    .msg { background: #1d2026; }
    .msg.user { background: #22314d; }
    .meta, .msg header { color: #a6acb4; }
  }
</style>
</head>
<body>
<main>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">导出时间 ${stamp(Date.now())} · ${messages.length} 条消息 · DSH WebChat</div>
${articles}
</main>
</body>
</html>
`
}

const download = (name: string, mime: string, content: string) => {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * 导出会话用于分享（官方是服务端分享链接，本机实例只能给文件）。
 * @param sessionId - 会话 id，按需从 IndexedDB 读取。
 * @param format - `md` 或 `html`。
 * @returns 是否导出成功。
 */
export const exportSessionShare = async (
  sessionId: string,
  format: 'md' | 'html'
): Promise<boolean> => {
  const session = await db.loadSession(sessionId).catch(() => undefined)
  if (session === undefined) {
    return false
  }
  const name = safeName(session.title)
  if (format === 'md') {
    download(`${name}.md`, 'text/markdown;charset=utf-8', sessionToMarkdown(session))
  } else {
    download(`${name}.html`, 'text/html;charset=utf-8', sessionToHtml(session))
  }
  return true
}
