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

// 上一次摆放时面板的下边界，供内容变高时保持底边不动
let anchorBottom = 0

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
  // 保留上一次由内容撑出来的高度：写死 PANEL_HEIGHT 会让"在设置视图点收起、再从托盘
  // 打开"时窗口被压回默认高度，内容截断又没有滚动条
  const height = Math.min(
    Math.max(win.getBounds().height, PANEL_HEIGHT),
    area.height - EDGE_GAP * 2
  )
  const rawX = trayPoint.x - PANEL_WIDTH / 2
  const x = Math.min(Math.max(rawX, area.x + EDGE_GAP), area.x + area.width - PANEL_WIDTH - EDGE_GAP)
  const y = area.y + area.height - height - EDGE_GAP

  anchorBottom = y + height
  win.setBounds({ x: Math.round(x), y: Math.round(y), width: PANEL_WIDTH, height }, false)
  win.show()
  win.focus()
}

/*
 * 渲染层量完内容高度后回传。窗口必须保持底边不动往上长：它是贴着任务栏摆放的，
 * 若按默认的左上角锚定，展开诊断清单（实测自然高度 538）会把面板推到屏幕外去。
 */
export function resizeFlyout(win: BrowserWindow, height: number): void {
  const bounds = win.getBounds()
  const area = screen.getDisplayNearestPoint(
    { x: bounds.x + bounds.width / 2, y: bounds.y },
  ).workArea
  const nextHeight = Math.min(Math.round(height), area.height - EDGE_GAP * 2)
  const bottom = anchorBottom || bounds.y + bounds.height
  let y = bottom - nextHeight
  if (y < area.y + EDGE_GAP) y = area.y + EDGE_GAP

  win.setBounds({ x: bounds.x, y: Math.round(y), width: bounds.width, height: nextHeight }, false)
}
