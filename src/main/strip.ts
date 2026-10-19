import { app, BrowserWindow, screen } from 'electron'
import { appendFileSync } from 'node:fs'
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
 * 粒度会让手感发顿。现在是渲染层把 pointermove 的屏幕坐标按时间间隔交给主进程摆放。
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
  if (clamped.x !== x || clamped.y !== y) clampedCount += 1
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

/*
 * 只在未打包时记一条拖动会话日志（userData/drag.log），用来分辨锁屏解锁后到底是哪一环断的：
 * 渲染层没把 pointerdown 送过来 → 文件里连 drag-begin 都没有；
 * 送过来了但主进程没有偏移量 → 会看到 drag-move-dropped；
 * 两边都正常却摆不动 → 看 applied 和 bounds 是否一致。
 * 每次拖动只写一行，不是每条鼠标事件都写。
 */
let moves = 0
let dropped = 0
let clampedCount = 0
let loggedDrop = false

function dragLog(line: string): void {
  if (app.isPackaged) return
  try {
    appendFileSync(join(app.getPath('userData'), 'drag.log'), `${new Date().toISOString()} ${line}\n`, 'utf8')
  } catch {
    // 日志写不进不影响功能
  }
}

export function beginStripDrag(cursor: StripPosition): void {
  if (!strip || strip.isDestroyed()) return
  const [x, y] = strip.getPosition()
  dragOffset = { x: cursor.x - x, y: cursor.y - y }
  moves = 0
  dropped = 0
  clampedCount = 0
  loggedDrop = false
  dragLog(`begin cursor=(${cursor.x},${cursor.y}) pos=(${x},${y})`)
}

export function moveStripDrag(cursor: StripPosition): void {
  if (!strip || strip.isDestroyed()) return
  if (!dragOffset) {
    dropped += 1
    if (!loggedDrop) {
      loggedDrop = true
      dragLog(`drag-move-dropped cursor=(${cursor.x},${cursor.y}) 没有按下时的偏移量`)
    }
    return
  }
  moves += 1
  const { width, height } = strip.getBounds()
  setStripBounds(cursor.x - dragOffset.x, cursor.y - dragOffset.y, width, height)
}

export function endStripDrag(): void {
  const bounds = strip && !strip.isDestroyed() ? strip.getBounds() : null
  dragLog(`end moves=${moves} dropped=${dropped} clamped=${clampedCount} bounds=${bounds ? `(${bounds.x},${bounds.y})` : 'gone'}`)
  dragOffset = null
  persistPosition()
}

interface SyncOptions {
  visible: boolean
  position: StripPosition | null
  onMoved: (position: StripPosition) => void
}

// 留着这份参数，解锁重建时才能力求"原地重建"：销毁旧窗后用同一份可见性与坐标再开一张
let lastSync: SyncOptions | null = null
let lastRefreshAt = 0

export function syncStrip(options: SyncOptions): void {
  movedHandler = options.onMoved
  lastSync = options

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

    // 渲染进程僵死/崩掉这两件事在日志里必须留下痕迹，不然锁屏那种"界面还在但没反应"没法归因
    strip.on('unresponsive', () => dragLog('event unresponsive'))
    strip.on('responsive', () => dragLog('event responsive'))
    strip.webContents.on('render-process-gone', (_event, details) =>
      dragLog(`event render-process-gone reason=${details.reason} exit=${details.exitCode}`)
    )
    strip.webContents.on('did-fail-load', (_event, code, text) =>
      dragLog(`event did-fail-load ${code} ${text}`)
    )
    strip.webContents.on('destroyed', () => dragLog('event web-contents-destroyed'))

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

/*
 * 锁屏→解锁之后原地重建浮条。实测到的现象是：窗口还在最上层（别的窗口被它压着）、点击也
 * 不穿透到下面的窗口、页面 JS 也活着（executeJavaScript 十几毫秒就回时间戳），但渲染层一个
 * pointerdown 都收不到。锁屏会切换显示模式，这张窗的"屏幕坐标 → 页面元素"映射就对不上了：
 * 系统把鼠标交给窗口，Chromium 的命中测试却算出"这里没有可交互像素"，事件被吞掉不发给 JS。
 * 重建会把映射重新建立起来——手工把浮条开关一次能修好，就是同一个原理，代价是解锁瞬间闪一下。
 */
export function refreshStripAfterUnlock(): void {
  if (!strip || strip.isDestroyed() || dragOffset || !lastSync) return

  // unlock-screen 和 resume 在同一次解锁里都会来（实测两条都触发），1.5 秒内只重建一次
  const now = Date.now()
  if (now - lastRefreshAt < 1500) return
  lastRefreshAt = now

  const bounds = strip.getBounds()
  dragLog(
    `unlock visible=${strip.isVisible()} loading=${strip.webContents.isLoading()} bounds=(${bounds.x},${bounds.y},${bounds.width},${bounds.height})`
  )

  // 先记住当前坐标，销毁后按同一坐标重建，位置不会跳
  const options = { ...lastSync, position: { x: bounds.x, y: bounds.y } }
  dragOffset = null
  strip.destroy()
  syncStrip(options)
}

export function destroyStrip(): void {
  dragOffset = null
  strip?.destroy()
  strip = null
}
