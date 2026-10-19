import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import type { StripPosition } from '../shared/types'

/*
 * 桌面浮条：一个可拖动、常驻置顶的小窗，直接显示每台设备的电量，省得每次去点托盘。
 *
 * 它不是嵌进任务栏——Windows 不允许第三方往任务栏里放自绘内容（`tray.setTitle`
 * 也只支持 macOS），所以这里是"贴在任务栏上方的一条浮窗"。位置由用户拖动决定并记住，
 * focusable:false 是为了点它时不抢走当前输入焦点。
 */

const STRIP_WIDTH = 176
const STRIP_HEIGHT = 34
const EDGE_GAP = 8
const MOVE_SAVE_DEBOUNCE_MS = 400

let strip: BrowserWindow | null = null
let saveTimer: NodeJS.Timeout | null = null

function loadStripContent(win: BrowserWindow): void {
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/#strip`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'strip' })
  }
}

// 记住的位置可能在另一块屏上（拔了显示器、换过分辨率），落到最近的工作区里再显示
function clampPosition(position: StripPosition | null): StripPosition {
  const area = screen.getPrimaryDisplay().workArea
  if (position) {
    const display = screen.getAllDisplays().find(
      (item) =>
        position.x >= item.workArea.x - 40 &&
        position.x <= item.workArea.x + item.workArea.width &&
        position.y >= item.workArea.y &&
        position.y <= item.workArea.y + item.workArea.height
    )
    if (display) return position
  }
  return {
    x: area.x + area.width - STRIP_WIDTH - EDGE_GAP,
    y: area.y + area.height - STRIP_HEIGHT - EDGE_GAP
  }
}

export function syncStrip(options: {
  visible: boolean
  position: StripPosition | null
  onMoved: (position: StripPosition) => void
}): void {
  if (!options.visible) {
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

    let pending: NodeJS.Timeout | null = null
    strip.on('moved', () => {
      if (!strip || saveTimer === pending) return
      if (pending) clearTimeout(pending)
      pending = setTimeout(() => {
        if (!strip || strip.isDestroyed()) return
        const [x, y] = strip.getPosition()
        options.onMoved({ x, y })
      }, MOVE_SAVE_DEBOUNCE_MS)
      saveTimer = pending
    })

    strip.on('closed', () => {
      strip = null
    })

    loadStripContent(strip)
  }

  const position = clampPosition(options.position)
  strip.setBounds({ ...position, width: STRIP_WIDTH, height: STRIP_HEIGHT }, false)
  if (!strip.isVisible()) strip.show()
}

export function resizeStrip(width: number, height: number): void {
  if (!strip || strip.isDestroyed()) return
  const [x, y] = strip.getPosition()
  strip.setBounds(
    {
      x,
      y,
      width: Math.max(80, Math.min(Math.round(width), 480)),
      height: Math.max(24, Math.min(Math.round(height), 80))
    },
    false
  )
}

export function destroyStrip(): void {
  strip?.destroy()
  strip = null
}
