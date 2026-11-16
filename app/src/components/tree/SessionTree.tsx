import clsx from 'clsx'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { requestMessageFocus } from '../../services/messageFocus.js'
import { messagesToReveal } from '../../services/chat/revealPath.js'
import { selectMessageVersion } from '../../services/chat/store.js'
import type { Session } from '../../services/chat/types.js'
import { IconCloseOutline16, IconFitOutline16, IconGearOutline16 } from '../base/icons.js'
import { IconButton } from '../base/IconButton.js'
import styles from './SessionTree.module.css'
import { layoutSessionTree, type TreeNode } from './treeLayout.js'

/** 面板宽度：默认值、可拖范围、以及持久化用的键。 */
const DEFAULT_WIDTH = 420
const MIN_WIDTH = 300
const MAX_WIDTH = 920
const WIDTH_KEY = 'chat-demo:branch-map-width'
/** 拖动时给聊天区留的最小宽度。 */
const CHAT_MIN_WIDTH = 360

/** 卡片尺寸与间距（px）：宽度按面板宽度和列数自适应。 */
const PAD = 8
const GAP = 8
const ROW_GAP = 10
const CARD_H = 84
const MIN_CARD_W = 120
const MAX_CARD_W = 240

const maxWidth = (): number =>
  Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, window.innerWidth - CHAT_MIN_WIDTH))

const readWidth = (): number => {
  try {
    const saved = Number(localStorage.getItem(WIDTH_KEY))
    if (Number.isFinite(saved) && saved >= MIN_WIDTH) {
      return Math.min(saved, maxWidth())
    }
  } catch {
    // 存储不可用时用默认宽度
  }
  return DEFAULT_WIDTH
}

/** 分支图谱的显示设置：存本机 localStorage。 */
type MapSettings = {
  /** 小地图 */
  mini: boolean
  /** 连线 */
  edges: boolean
  /** 配色 id */
  palette: string
  /** 背景：纯色 / 渐变 / 点阵 */
  background: 'plain' | 'gradient' | 'dots'
  /** 非当前分支的暗度 0.15–0.7 */
  dim: number
}

const SETTINGS_KEY = 'chat-demo:branch-map-settings'

/** 配色方案：色值只作为 accent，卡片底色由它与背景色混合得到，深色主题自动适配。 */
const PALETTES: { id: string; label: string; accent: string; swatch: string }[] = [
  { id: 'brand', label: '跟随主题', accent: 'var(--dsw-alias-brand-primary)', swatch: 'var(--dsw-alias-brand-primary)' },
  { id: 'ocean', label: '海蓝', accent: '#2F7BF6', swatch: '#2F7BF6' },
  { id: 'teal', label: '青绿', accent: '#0E9F9A', swatch: '#0E9F9A' },
  { id: 'violet', label: '紫罗兰', accent: '#7C5CFC', swatch: '#7C5CFC' },
  { id: 'amber', label: '琥珀', accent: '#C27803', swatch: '#C27803' },
]

const DEFAULT_SETTINGS: MapSettings = {
  mini: true,
  edges: true,
  palette: 'brand',
  background: 'gradient',
  dim: 0.32,
}

const readSettings = (): MapSettings => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) {
      return DEFAULT_SETTINGS
    }
    const parsed = JSON.parse(raw) as Partial<MapSettings>
    return {
      mini: typeof parsed.mini === 'boolean' ? parsed.mini : DEFAULT_SETTINGS.mini,
      edges: typeof parsed.edges === 'boolean' ? parsed.edges : DEFAULT_SETTINGS.edges,
      palette:
        typeof parsed.palette === 'string' && PALETTES.some((item) => item.id === parsed.palette)
          ? parsed.palette
          : DEFAULT_SETTINGS.palette,
      background:
        parsed.background === 'plain' || parsed.background === 'gradient' || parsed.background === 'dots'
          ? parsed.background
          : DEFAULT_SETTINGS.background,
      dim: typeof parsed.dim === 'number' && parsed.dim >= 0.1 && parsed.dim <= 0.8 ? parsed.dim : DEFAULT_SETTINGS.dim,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

/** 行内时间戳：HH:mm（本地时区）。 */
const timeOf = (createdAt: number): string => {
  const date = new Date(createdAt)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/** 输出 token 的紧凑写法。 */
const tokensOf = (n: number): string => (n < 1000 ? String(n) : `${(n / 1000).toFixed(1)}k`)

/**
 * 当前会话的分支图谱：时间向下、分支向右，一层一行。
 * 同一行里的卡片按列等宽铺满面板，所以并排的备选回答不会挤成窄条；
 * 点击只能切换"父节点在当前路径上"的备选，卡片右上角可折叠整段分支。
 * 面板左缘可拖动调宽（宽度记在本机），「适应」按钮把整棵树缩到看得全。
 */
export const SessionTree = ({ session, onClose }: { session: Session; onClose: () => void }) => {
  const t = useTranslate()
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  const [width, setWidth] = useState(readWidth)
  const [dragging, setDragging] = useState(false)
  // 默认 100% 可读；「适应」按钮一次性缩到看得全，Ctrl+滚轮随时改
  const [zoom, setZoom] = useState<number>(1)
  const [box, setBox] = useState({ width: 0, height: 0 })
  // 小地图视口框：直接写 DOM，不走 state，滚动时不触发重渲染
  const miniViewRef = useRef<SVGRectElement>(null)
  // 只渲染视口附近的卡片：187 张卡也只留常驻的几十个 DOM
  const [band, setBand] = useState({ from: 0, to: 1600 })
  const scrollRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)
  // 画布拖动（平移）与 Ctrl+滚轮缩放
  const panRef = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null)
  const suppressClickRef = useRef(false)
  const anchorRef = useRef<{ cx: number; cy: number; px: number; py: number } | null>(null)
  const scaleRef = useRef(1)
  const [panning, setPanning] = useState(false)
  const [settings, setSettings] = useState<MapSettings>(readSettings)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    } catch {
      // 存不下就只在本次会话生效
    }
  }, [settings])

  // Esc 关闭设置面板
  useEffect(() => {
    if (!settingsOpen) {
      return undefined
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSettingsOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [settingsOpen])

  useEffect(() => {
    setCollapsed(new Set())
  }, [session.id])

  // 窗口变窄时收回到可用宽度。
  useEffect(() => {
    const onResize = () => setWidth((current) => Math.min(current, maxWidth()))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // 「适应」和自适应列宽都需要可视区尺寸。
  useEffect(() => {
    const element = scrollRef.current
    if (!element) {
      return undefined
    }
    const update = () => {
      setBox({ width: element.clientWidth, height: element.clientHeight })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const layout = useMemo(() => layoutSessionTree(session, collapsed), [session, collapsed])
  const byId = useMemo(() => new Map(layout.nodes.map((node) => [node.id, node])), [layout])


  const leaves = Math.max(1, layout.leaves)
  const avail = Math.max(MIN_CARD_W * leaves, (box.width || DEFAULT_WIDTH) - PAD * 2 - 4)
  const cardWidth = Math.max(
    MIN_CARD_W,
    Math.min(MAX_CARD_W, Math.floor((avail - (leaves - 1) * GAP) / leaves))
  )
  const contentWidth = leaves * cardWidth + (leaves - 1) * GAP
  const rowPitch = CARD_H + ROW_GAP
  const contentHeight = Math.max(0, layout.depths * rowPitch - ROW_GAP)
  // 树不是被框死的：四周留出"空白空间"，每边约 60% 视口（至少 240px），
  // 这样拖到边缘时还有地方可去，树像是画布上的一部分而不是塞满的边框。
  const freeX = Math.max(240, Math.round((box.width || DEFAULT_WIDTH) * 0.6))
  const freeY = Math.max(240, Math.round((box.height || 600) * 0.6))
  // 树比可用宽度窄时整体居中，不让它贴着左边。
  const originX = freeX + PAD + Math.max(0, (avail - contentWidth) / 2)
  const canvasWidth = freeX * 2 + PAD * 2 + Math.max(contentWidth, avail)
  const canvasHeight = freeY * 2 + PAD * 2 + contentHeight
  const leftOf = (slot: number): number => originX + slot * (cardWidth + GAP)
  const topOf = (depth: number): number => freeY + PAD + depth * rowPitch
  // 小地图的缩略矩形：只依赖几何和配色，滚动时不重建
  const miniRects = useMemo(
    () =>
      layout.nodes.map((node) => (
        <rect
          key={node.id}
          x={originX + node.slot * (cardWidth + GAP)}
          y={freeY + PAD + node.depth * rowPitch}
          width={cardWidth}
          height={CARD_H}
          rx={8}
          className={node.role === 'user' ? styles.miniUser : styles.miniBot}
          opacity={node.onPath ? 1 : 0.3}
        />
      )),
    [layout.nodes, originX, cardWidth, rowPitch, freeY]
  )
  // 「适应」只看树本身的大小，不含四周留白，否则会白缩一圈。
  const fitScale =
    box.width > 0 && box.height > 0
      ? Math.min(
          1,
          (box.width - PAD * 2) / Math.max(1, Math.max(contentWidth, avail)),
          (box.height - PAD * 2) / Math.max(1, contentHeight)
        )
      : 0.05
  const scale = Math.max(0.05, Math.min(1.5, zoom))
  const overflowing =
    box.width > 0 &&
    box.height > 0 &&
    (Math.max(contentWidth, avail) * scale > box.width || contentHeight * scale > box.height)
  const percent = Math.round(scale * 100)
  scaleRef.current = scale
  const palette = PALETTES.find((item) => item.id === settings.palette) ?? PALETTES[0]
  const asideStyle = {
    width,
    '--map-accent': palette.accent,
    '--map-dim': settings.dim,
  } as React.CSSProperties

  // Ctrl / ⌘ + 滚轮：以光标为锚点缩放，并保持光标下的内容不动。
  useEffect(() => {
    const element = scrollRef.current
    if (!element) {
      return undefined
    }
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) {
        return
      }
      event.preventDefault()
      const rect = element.getBoundingClientRect()
      const px = event.clientX - rect.left
      const py = event.clientY - rect.top
      const current = scaleRef.current
      const next = Math.max(0.05, Math.min(1.5, current * Math.exp(-event.deltaY * 0.0015)))
      if (next === current) {
        return
      }
      anchorRef.current = {
        cx: (element.scrollLeft + px) / current,
        cy: (element.scrollTop + py) / current,
        px,
        py,
      }
      setZoom(next)
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [])

  // 小地图视口框：滚动/缩放时用 rAF 直接改属性，避免每帧重渲染整棵树。
  useEffect(() => {
    const element = scrollRef.current
    if (!element) {
      return undefined
    }
    let frame = 0
    const apply = () => {
      frame = 0
      const rect = miniViewRef.current
      if (!rect) {
        return
      }
      rect.setAttribute('x', String(element.scrollLeft / scale))
      rect.setAttribute('y', String(element.scrollTop / scale))
      rect.setAttribute('width', String(element.clientWidth / scale))
      rect.setAttribute('height', String(element.clientHeight / scale))
    }
    const schedule = () => {
      if (frame === 0) {
        frame = requestAnimationFrame(apply)
      }
    }
    apply()
    element.addEventListener('scroll', schedule, { passive: true })
    const observer = new ResizeObserver(schedule)
    observer.observe(element)
    return () => {
      element.removeEventListener('scroll', schedule)
      observer.disconnect()
      if (frame !== 0) {
        cancelAnimationFrame(frame)
      }
    }
  }, [scale, canvasWidth, canvasHeight])

  // 滚动时更新可见纵向区间（rAF 合并，移动不足 1/4 屏不更新 state）
  useEffect(() => {
    const element = scrollRef.current
    if (!element) {
      return undefined
    }
    let frame = 0
    const apply = () => {
      frame = 0
      const top = element.scrollTop / scale
      const height = element.clientHeight / scale
      const margin = height * 0.6
      const next = { from: top - margin, to: top + height + margin }
      setBand((previous) =>
        Math.abs(previous.from - next.from) < height * 0.25 &&
        Math.abs(previous.to - next.to) < height * 0.25
          ? previous
          : next
      )
    }
    const schedule = () => {
      if (frame === 0) {
        frame = requestAnimationFrame(apply)
      }
    }
    apply()
    element.addEventListener('scroll', schedule, { passive: true })
    const observer = new ResizeObserver(schedule)
    observer.observe(element)
    return () => {
      element.removeEventListener('scroll', schedule)
      observer.disconnect()
      if (frame !== 0) {
        cancelAnimationFrame(frame)
      }
    }
  }, [scale])

  // 打开或切会话时把树摆到水平中间，纵向从头开始。
  useEffect(() => {
    const element = scrollRef.current
    if (!element) {
      return
    }
    element.scrollLeft = Math.max(0, (canvasWidth - element.clientWidth) / 2)
    element.scrollTop = 0
  }, [session.id, canvasWidth])

  // 缩放后把光标下的内容放回原处。
  useLayoutEffect(() => {
    const anchor = anchorRef.current
    const element = scrollRef.current
    if (!anchor || !element) {
      return
    }
    anchorRef.current = null
    element.scrollLeft = anchor.cx * scale - anchor.px
    element.scrollTop = anchor.cy * scale - anchor.py
  }, [scale])

  /**
   * 按住空白/卡片拖动平移画布。拖动超过 4px 才算平移，并吞掉随之而来的 click，
   * 所以"点卡片跳转"和"拖动画布"不会互相误触。
   */
  const startPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return
    }
    if ((event.target as HTMLElement).closest('button')) {
      return
    }
    const element = scrollRef.current
    if (!element) {
      return
    }
    const start = {
      x: event.clientX,
      y: event.clientY,
      left: element.scrollLeft,
      top: element.scrollTop,
      moved: false,
    }
    panRef.current = start
    let frame = 0
    let latestX = element.scrollLeft
    let latestY = element.scrollTop
    const flush = () => {
      frame = 0
      element.scrollLeft = latestX
      element.scrollTop = latestY
    }
    const onMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - start.x
      const dy = moveEvent.clientY - start.y
      if (!start.moved && Math.abs(dx) + Math.abs(dy) > 4) {
        start.moved = true
        setPanning(true)
      }
      if (!start.moved) {
        return
      }
      // 一帧只写一次滚动位置，pointermove 比帧还密时不会反复触发排版
      latestX = start.left - dx
      latestY = start.top - dy
      if (frame === 0) {
        frame = requestAnimationFrame(flush)
      }
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      if (frame !== 0) {
        cancelAnimationFrame(frame)
        flush()
      }
      panRef.current = null
      setPanning(false)
      if (start.moved) {
        suppressClickRef.current = true
        setTimeout(() => {
          suppressClickRef.current = false
        }, 0)
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
    window.addEventListener('pointercancel', onUp, { once: true })
  }

  /**
   * 点任意卡片：先把那条分支恢复成当前路径（沿祖先链逐层切换），再滚到该消息。
   * 已经在当前路径上的就直接滚过去。
   */
  const reveal = (node: TreeNode) => {
    for (const id of messagesToReveal(session, node.id)) {
      selectMessageVersion(session.id, id)
    }
    requestMessageFocus(node.id)
  }

  const toggle = (id: string) => {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current === null) {
      return
    }
    dragRef.current = null
    setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    try {
      localStorage.setItem(WIDTH_KEY, String(width))
    } catch {
      // 存不下就只在本次会话生效
    }
  }

  /** 小地图：按点击位置把主视图居中到对应画布坐标（可按住拖动）。 */
  const miniJump = (clientX: number, clientY: number, target: SVGSVGElement) => {
    const element = scrollRef.current
    if (!element) {
      return
    }
    const rect = target.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) {
      return
    }
    const fx = (clientX - rect.left) / rect.width
    const fy = (clientY - rect.top) / rect.height
    element.scrollLeft = fx * canvasWidth * scale - element.clientWidth / 2
    element.scrollTop = fy * canvasHeight * scale - element.clientHeight / 2
  }

  const statusOf = (node: TreeNode): { text: string; error: boolean } | null => {
    if (node.status === 'error') {
      return { text: t('branchTreeFailed'), error: true }
    }
    if (node.status === 'stopped') {
      return { text: t('branchTreeStopped'), error: false }
    }
    if (node.status === 'streaming' || node.status === 'pending') {
      return { text: t('branchTreeStreaming'), error: false }
    }
    return null
  }

  return (
    <aside
      className={clsx(styles.panel, dragging && styles.dragging)}
      style={asideStyle}
      aria-label={t('branchTreeTitle')}
    >
      <div
        className={styles.handle}
        role="separator"
        aria-orientation="vertical"
        aria-label={t('branchTreeResize')}
        title={t('branchTreeResize')}
        onPointerDown={(event) => {
          event.preventDefault()
          event.currentTarget.setPointerCapture(event.pointerId)
          dragRef.current = { startX: event.clientX, startWidth: width }
          setDragging(true)
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current
          if (drag === null) {
            return
          }
          const next = drag.startWidth - (event.clientX - drag.startX)
          setWidth(Math.max(MIN_WIDTH, Math.min(maxWidth(), next)))
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => {
          setWidth(DEFAULT_WIDTH)
          try {
            localStorage.setItem(WIDTH_KEY, String(DEFAULT_WIDTH))
          } catch {
            // 忽略存储失败
          }
        }}
      />
      <div className={styles.head}>
        <div className={styles.headText}>
          <span className={styles.title}>{t('branchTreeTitle')}</span>
          <span className={styles.stats}>
            {t('branchTreeStats', { messages: layout.count, forks: layout.forks })}
            {layout.hidden > 0 ? ` · ${t('branchTreeHidden', { count: layout.hidden })}` : ''}
            {percent !== 100 ? ` · ${percent}%` : ''}
          </span>
        </div>
        <div className={styles.headActions}>
          <button
            type="button"
            className={styles.zoomButton}
            aria-label={t('branchTreeZoomOut')}
            title={t('branchTreeZoomOut')}
            onClick={() => setZoom(Math.max(0.05, scale / 1.25))}
          >
            −
          </button>
          <button
            type="button"
            className={styles.zoomValue}
            aria-label={t('branchTreeZoomFit')}
            title={t('branchTreeZoomFit')}
            onClick={() => setZoom(1)}
          >
            {percent}%
          </button>
          <button
            type="button"
            className={styles.zoomButton}
            aria-label={t('branchTreeZoomIn')}
            title={t('branchTreeZoomIn')}
            onClick={() => setZoom(Math.min(1.5, scale * 1.25))}
          >
            +
          </button>
          <IconButton
            size="xs"
            icon={<IconGearOutline16 />}
            tooltip={t('branchTreeSettings')}
            onClick={() => setSettingsOpen((open) => !open)}
          />
          <IconButton
            size="xs"
            icon={<IconFitOutline16 />}
            tooltip={t('branchTreeFit')}
            onClick={() => setZoom(fitScale)}
          />
          <IconButton
            size="xs"
            icon={<IconCloseOutline16 />}
            tooltip={t('branchTreeClose')}
            onClick={onClose}
          />
        </div>
      </div>
      {settingsOpen ? (
        <div className={styles.settings} role="dialog" aria-label={t('branchTreeSettings')}>
          <label className={styles.settingRow}>
            <span>{t('branchTreeMiniMapToggle')}</span>
            <input
              type="checkbox"
              checked={settings.mini}
              onChange={(event) => setSettings({ ...settings, mini: event.target.checked })}
            />
          </label>
          <label className={styles.settingRow}>
            <span>{t('branchTreeEdgesToggle')}</span>
            <input
              type="checkbox"
              checked={settings.edges}
              onChange={(event) => setSettings({ ...settings, edges: event.target.checked })}
            />
          </label>
          <div className={styles.settingRow}>
            <span>{t('branchTreePalette')}</span>
            <div className={styles.swatches}>
              {PALETTES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={clsx(styles.swatch, settings.palette === item.id && styles.swatchActive)}
                  style={{ background: item.swatch }}
                  title={item.label}
                  aria-label={item.label}
                  onClick={() => setSettings({ ...settings, palette: item.id })}
                />
              ))}
            </div>
          </div>
          <div className={styles.settingRow}>
            <span>{t('branchTreeBackground')}</span>
            <div className={styles.segmented}>
              {(['plain', 'gradient', 'dots'] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  className={clsx(styles.segment, settings.background === id && styles.segmentActive)}
                  onClick={() => setSettings({ ...settings, background: id })}
                >
                  {t(
                    id === 'plain'
                      ? 'branchTreeBgPlain'
                      : id === 'gradient'
                        ? 'branchTreeBgGradient'
                        : 'branchTreeBgDots'
                  )}
                </button>
              ))}
            </div>
          </div>
          <label className={styles.settingRow}>
            <span>{t('branchTreeDim')}</span>
            <input
              type="range"
              min={15}
              max={70}
              value={Math.round(settings.dim * 100)}
              onChange={(event) => setSettings({ ...settings, dim: Number(event.target.value) / 100 })}
            />
          </label>
        </div>
      ) : null}
      <div className={styles.scrollWrap} data-bg={settings.background}>
      <div
        className={clsx(styles.scroll, panning && styles.scrollPanning)}
        ref={scrollRef}
        onPointerDown={startPan}
      >
        <div
          className={styles.scaler}
          style={{ width: canvasWidth * scale, height: canvasHeight * scale }}
        >
          <div
            className={styles.canvas}
            style={{
              width: canvasWidth,
              height: canvasHeight,
              transform: `scale(${scale})`,
              transformOrigin: '0 0',
            }}
          >
          <svg
            className={styles.lines}
            width={canvasWidth}
            height={canvasHeight}
            aria-hidden="true"
            focusable="false"
          >
            {(settings.edges ? layout.edges : []).map((edge) => {
              const from = byId.get(edge.from)
              const to = byId.get(edge.to)
              if (!from || !to) {
                return null
              }
              const startX = leftOf(from.slot) + cardWidth / 2
              const startY = topOf(from.depth) + CARD_H
              const midY = startY + ROW_GAP / 2
              const endX = leftOf(to.slot) + cardWidth / 2
              const endY = topOf(to.depth)
              return (
                <path
                  key={`${edge.from}:${edge.to}`}
                  className={clsx(styles.edge, edge.onPath ? styles.edgeOn : styles.edgeOff)}
                  d={`M${startX} ${startY} V${midY} H${endX} V${endY}`}
                />
              )
            })}
          </svg>
          {layout.nodes
            .filter((node) => {
              const top = topOf(node.depth)
              return top + CARD_H >= band.from && top <= band.to
            })
            .map((node) => {

            const status = statusOf(node)
            const flags: string[] = []
            if (node.outputTokens !== undefined) {
              flags.push(t('branchTreeTokens', { count: tokensOf(node.outputTokens) }))
            }
            if (node.thinking) {
              flags.push(t('branchTreeThinking'))
            }
            if (node.search) {
              flags.push(t('branchTreeSearch'))
            }
            return (
              <div
                key={node.id}
                className={clsx(
                  styles.card,
                  node.role === 'user' ? styles.cardUser : styles.cardBot,
                  !node.onPath && styles.cardOff,
                  node.current && styles.cardCurrent
                )}
                style={{
                  top: topOf(node.depth),
                  left: leftOf(node.slot),
                  width: cardWidth,
                  height: CARD_H,
                }}
                title={node.snippet || t('branchTreeEmptyNode')}
                onClick={() => {
                  if (suppressClickRef.current) {
                    return
                  }
                  reveal(node)
                }}
              >
                <div className={styles.meta}>
                  <span
                    className={clsx(
                      styles.roleIcon,
                      node.role === 'user' ? styles.roleUser : styles.roleBot
                    )}
                    aria-hidden="true"
                  />
                  <span className={styles.role}>
                    {node.role === 'user'
                      ? t('branchTreeRoleUser')
                      : (node.model ?? t('branchTreeRoleAssistant'))}
                  </span>
                  {node.versions > 1 ? (
                    <span className={clsx(styles.badge, node.onPath && styles.badgeOn)}>
                      {node.versionIndex + 1}/{node.versions}
                    </span>
                  ) : null}
                  {status ? (
                    <span className={clsx(styles.badge, status.error && styles.badgeError)}>
                      {status.text}
                    </span>
                  ) : null}
                </div>
                <div className={styles.snippet}>
                  {node.snippet || t('branchTreeEmptyNode')}
                </div>
                <div className={styles.foot}>
                  <span className={styles.flags}>{flags.join(' · ')}</span>
                  <span className={styles.time}>{timeOf(node.createdAt)}</span>
                </div>
                {node.hasChildren ? (
                  <button
                    type="button"
                    className={styles.toggle}
                    aria-label={node.collapsed ? t('branchTreeExpand') : t('branchTreeCollapse')}
                    title={node.collapsed ? t('branchTreeExpand') : t('branchTreeCollapse')}
                    onClick={(event) => {
                      event.stopPropagation()
                      toggle(node.id)
                    }}
                  >
                    {node.collapsed ? `+${node.hiddenDescendants}` : '−'}
                  </button>
                ) : null}
              </div>
            )
          })}
          </div>
        </div>
      </div>
      {overflowing && settings.mini ? (
        <div className={styles.mini} title={t('branchTreeMiniMap')}>
          <svg
            className={styles.miniMap}
            viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
            preserveAspectRatio="none"
            onPointerDown={(event) => {
              event.preventDefault()
              event.currentTarget.setPointerCapture(event.pointerId)
              miniJump(event.clientX, event.clientY, event.currentTarget)
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                miniJump(event.clientX, event.clientY, event.currentTarget)
              }
            }}
          >
            {miniRects}
            <rect ref={miniViewRef} className={styles.miniView} />
          </svg>
        </div>
      ) : null}
      </div>
      <div className={styles.legend}>{t('branchTreeLegend')}</div>
    </aside>
  )
}
