import type { Locale } from './settings.js'

/** 官方协议页（中英文各一份）；本地实例只是链接过去，不镜像内容 */
const TERMS: Record<Locale, string> = {
  'zh-CN': 'https://cdn.deepseek.com/policies/zh-CN/deepseek-terms-of-use.html',
  'en-US': 'https://cdn.deepseek.com/policies/en-US/deepseek-terms-of-use.html',
}

const PRIVACY: Record<Locale, string> = {
  'zh-CN': 'https://cdn.deepseek.com/policies/zh-CN/deepseek-privacy-policy.html',
  'en-US': 'https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html',
}

/** 上游项目（MIT）：这个页面是从它的源码 fork 出来的 */
export const UPSTREAM_URL = 'https://github.com/deepseek-ai/chat-demo'

export const termsUrl = (locale: Locale): string => TERMS[locale]

export const privacyUrl = (locale: Locale): string => PRIVACY[locale]
