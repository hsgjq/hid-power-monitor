import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import type { StripPosition } from '../shared/types'

/*
 * 桌面浮条：一个可拖动、常驻置顶的小窗，直接显示每台设备的电量，省得每次去点托盘。
 *
 * 它不是嵌进任务栏——Windows 不允许第三方往任务栏里放自绘内容（`tray.setTitle`
 * 也只支持 macOS），所以这里是"贴在任务栏上方的一条浮窗"。位置由用户拖动决定并记住，
 * focusable:false 是为了点它时不抢走当前输入焦点。
 *
 * 拖动不用 `-webkit-app-region: drag`：那种拖动依赖窗口能被激活，而 focusable:false
 * 的窗口在别的程序成为前台之后就拖不动了。也不用主进程定时轮询光标——Windows 定时器
 * 粒度会让手感发顿。现在是渲染层把 pointermove 的屏幕坐标按帧交给主进程摆放，事件驱动。
 */

const STRIP_WIDTH = 176
const STRIP_HEIGHT = 34
const EDGE_GAP = 8
const MOVE_SAVE_DEBOUNCE_MS = 400

let strip: BrowserWindow | null = null
let saveTimer: NodeJS.Timeout | null = null
let dragOffset: StripPosition | null = null
let applyingBounds = false

function loadStripContent(win: BrowserWindow): void {
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/#strip`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'strip' })
  }
}

function areaAt(x: number, y: number) {
  return screen.getDisplayNearestPoint({ x, y }).workArea
}

// 整条留在工作区内：拖到屏幕外就再也点不到它，等于把自己藏起来
function clampToArea(x: number, y: number, width: number, height: number): StripPosition {
  const area = areaAt(x + width / 2, y + height / 2)
  return {
    x: Math.min(Math.max(x, area.x), area.x + area.width - width),
    y: Math.min(Math.max(y, area.y), area.y + area.height - height)
  }
}

function setStripBounds(x: number, y: number, width: number, height: number): void {
  if (!strip || strip.isDestroyed()) return
  const clamped = clampToArea(x, y, width, height)
  applyingBounds = true
  strip.setBounds({ ...clamped, width, height }, false)
  applyingBounds = false
}

function persistPosition(): void {
  if (!strip || strip.isDestroyed() || !movedHandler) return
  const [x, y] = strip.getPosition()
  movedHandler({ x, y })
}

let movedHandler: ((position: StripPosition) => void) | null = null

export function beginStripDrag(cursor: StripPosition): void {
  if (!strip || strip.isDestroyed()) return
  const [x, y] = strip.getPosition()
  dragOffset = { x: cursor.x - x, y: cursor.y - y }
}

export function moveStripDrag(cursor: StripPosition): void {
  if (!strip || strip.isDestroyed() || !dragOffset) return
  const { width, height } = strip.getBounds()
  setStripBounds(cursor.x - dragOffset.x, cursor.y - dragOffset.y, width, height)
}

export function endStripDrag(): void {
  dragOffset = null
  persistPosition()
}

export function syncStrip(options: {
  visible: boolean
  position: StripPosition | null
  onMoved: (position: StripPosition) => void
}): void {
  movedHandler = options.onMoved

  if (!options.visible) {
    dragOffset = null
    strip?.destroy()
    strip = null
    return
  }

  if (!strip || strip.isDestroyed()) {
    strip = new BrowserWindow({
      width: STRIP_WIDTH,
      height: STRIP_HEIGHT,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: true,
      focusable: false,
      skipTaskbar: true,
      hasShadow: false,
      fullscreenable: false,
      maximizable: false,
      minimizable: false,
      alwaysOnTop: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        backgroundThrottling: false
      }
    })

    strip.setMenu(null)
    strip.setAlwaysOnTop(true, 'screen-saver')

    strip.on('moved', () => {
      if (applyingBounds) return
      const bounds = strip?.getBounds()
      if (!bounds || !strip) return
      const clamped = clampToArea(bounds.x, bounds.y, bounds.width, bounds.height)
      if (clamped.x !== bounds.x || clamped.y !== bounds.y) setStripBounds(clamped.x, clamped.y, bounds.width, bounds.height)

      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = setTimeout(persistPosition, MOVE_SAVE_DEBOUNCE_MS)
    })

    strip.on('closed', () => {
      strip = null
    })

    loadStripContent(strip)
  }

  const start = clampToArea(
    options.position?.x ?? 0,
    options.position?.y ?? 0,
    strip.getBounds().width,
    strip.getBounds().height
  )
  const fallback = areaAt(start.x, start.y)
  const position = options.position
    ? start
    : {
        x: fallback.x + fallback.width - strip.getBounds().width - EDGE_GAP,
        y: fallback.y + fallback.height - strip.getBounds().height - EDGE_GAP
      }

  strip.setBounds({ ...position, width: strip.getBounds().width, height: strip.getBounds().height }, false)
  if (!strip.isVisible()) strip.show()
}

export function resizeStrip(width: number, height: number): void {
  if (!strip || strip.isDestroyed()) return
  const bounds = strip.getBounds()
  const nextWidth = Math.max(80, Math.min(Math.round(width), 480))
  const nextHeight = Math.max(24, Math.min(Math.round(height), 80))
  setStripBounds(bounds.x, bounds.y, nextWidth, nextHeight)
}

/*
 * 换分辨率、插拔外接屏之后要把浮条重新夹回工作区：记住的坐标是在另一块屏上算出来的，
 * 拓扑一变就可能落到已经不存在的区域，表现就是浮条"消失了"。拖动过程中不能插手，
 * 否则会把用户正在拖的那一帧顶回去。
 */
let displayWatchArmed = false

function reclampAfterDisplayChange(): void {
  if (!strip || strip.isDestroyed() || dragOffset) return
  const bounds = strip.getBounds()
  setStripBounds(bounds.x, bounds.y, bounds.width, bounds.height)
}

export function watchDisplays(): void {
  if (displayWatchArmed) return
  displayWatchArmed = true
  screen.on('display-added', reclampAfterDisplayChange)
  screen.on('display-removed', reclampAfterDisplayChange)
  screen.on('display-metrics-changed', reclampAfterDisplayChange)
}

export function destroyStrip(): void {
  dragOffset = null
  strip?.destroy()
  strip = null
}
