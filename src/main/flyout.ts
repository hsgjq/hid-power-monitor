import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'

/*
 * 托盘弹层窗口：无边框 + 透明 + 不进任务栏，靠渲染层量完内容后回传高度调整大小。
 * PANEL_HEIGHT 只是首帧默认值（按两行设备实测出来的 274），不是最终高度。
 * transparent 窗口自己画不了系统阴影，所以 hasShadow:false，阴影由 CSS 在窗口内画，
 * 四周留 10px 透明边给它。
 */

const PANEL_WIDTH = 340
const PANEL_HEIGHT = 274
const EDGE_GAP = 8

export function createFlyoutWindow(options: { hideOnBlur: boolean }): BrowserWindow {
  const win = new BrowserWindow({
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    maximizable: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  })

  win.setMenu(null)
  win.setMenuBarVisibility(false)

  if (options.hideOnBlur) {
    // 只有真正获得过焦点后失焦才收起，否则刚弹出就被别的窗口抢回焦点会一闪而过
    let focused = false
    win.on('focus', () => {
      focused = true
    })
    win.on('blur', () => {
      if (!focused) return
      focused = false
      win.hide()
    })
  }

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

export function showFlyout(win: BrowserWindow, trayPoint: { x: number; y: number }): void {
  const area = screen.getDisplayNearestPoint(trayPoint).workArea
  const rawX = trayPoint.x - PANEL_WIDTH / 2
  const x = Math.min(Math.max(rawX, area.x + EDGE_GAP), area.x + area.width - PANEL_WIDTH - EDGE_GAP)
  const y = area.y + area.height - PANEL_HEIGHT - EDGE_GAP

  win.setPosition(Math.round(x), Math.round(y), false)
  win.show()
  win.focus()
}
