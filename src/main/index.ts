import { app, BrowserWindow, clipboard, ipcMain, screen } from 'electron'
import { createFlyoutWindow, resizeFlyout, showFlyout } from './flyout'
import { buildDiagnostics } from './hid/diagnostics'
import {
  beginStripDrag,
  destroyStrip,
  endStripDrag,
  moveStripDrag,
  resizeStrip,
  syncStrip,
  watchDisplays
} from './strip'
import { applySnapshotToTray, createTray } from './tray'
import { checkLowBattery } from './notify'
import { loadSettings, saveSettings, syncLoginItem } from './settings'
import { onSnapshot, pushSnapshot, startPolling, stopPolling } from './power/service'
import type { AppSettings, PowerSnapshot, StripPosition } from '../shared/types'

/*
 * 主进程入口：单实例 + 托盘 + 弹层 + 轮询。
 * 这个应用没有"主窗口"概念，面板是点托盘才弹的临时窗，所以窗口全关也不退出
 * （见文件末尾的 window-all-closed）。
 */

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

let flyout: BrowserWindow | null = null
let tray: ReturnType<typeof createTray> | null = null
let last: PowerSnapshot | null = null

function trayAnchorPoint(): { x: number; y: number } {
  const bounds = tray?.getBounds()
  if (!bounds || bounds.width === 0) {
    const area = screen.getPrimaryDisplay().workArea
    return { x: area.x + area.width - 40, y: area.y + 4 }
  }
  return { x: bounds.x + bounds.width / 2, y: bounds.y }
}

function toggleFlyout(point: { x: number; y: number }): void {
  if (!flyout) return
  if (flyout.isVisible()) {
    flyout.hide()
    return
  }
  showFlyout(flyout, point)
}

/*
 * 把面板叫出来，不切换：系统通知被点击、或者又启动了一个实例时用它。
 * 用 toggle 会有个怪事——面板恰好开着时这些动作反而把它收掉。
 * 托盘图标被折进溢出区时 getBounds() 给的是负坐标，所以那种情况下退到屏幕右下角。
 */
function revealFlyout(): void {
  if (!flyout) return
  if (!flyout.isVisible()) showFlyout(flyout, trayAnchorPoint())
}

function applyStrip(settings: AppSettings): void {
  syncStrip({
    visible: settings.stripVisible,
    position: settings.stripPosition,
    onMoved: (position: StripPosition) => {
      saveSettings({ stripPosition: position })
    }
  })
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.hidpowermonitor.tray')

  flyout = createFlyoutWindow({ hideOnBlur: app.isPackaged })
  tray = createTray(toggleFlyout, () => pushSnapshot(), () => app.quit())

  onSnapshot((snapshot) => {
    last = snapshot
    if (tray) applySnapshotToTray(tray, snapshot, loadSettings().lowBatteryPercent)
    checkLowBattery(snapshot, revealFlyout)
  })

  ipcMain.handle('power:get-snapshot', () => last ?? pushSnapshot())
  ipcMain.on('power:refresh', () => pushSnapshot())
  ipcMain.on('flyout:hide', () => flyout?.hide())
  ipcMain.on('flyout:resize', (_event, height: number) => {
    if (!flyout || !Number.isFinite(height)) return
    resizeFlyout(flyout, height)
  })
  ipcMain.handle('settings:get', () => loadSettings())
  ipcMain.handle('runtime:flags', () => ({ loginItemSupported: app.isPackaged }))
  ipcMain.handle('settings:save', (_event, patch: Partial<AppSettings>) => {
    const next = saveSettings(patch)
    // 只有动到浮条相关项才重建窗口，避免每次改阈值都闪一下
    if ('stripVisible' in patch || 'stripPosition' in patch) applyStrip(next)
    // 改了阈值就重画一次托盘图标，不然要等下一轮轮询（最长 30 秒）才看得见效
    if ('lowBatteryPercent' in patch && tray && last) {
      applySnapshotToTray(tray, last, next.lowBatteryPercent)
    }
    // 弹层里改的颜色要立刻反映到已经显示着的浮条上，两边是不同窗口
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('settings:changed', next)
    }
    return next
  })
  ipcMain.handle('diagnostics:get', () => buildDiagnostics())
  // 剪贴板走主进程：渲染层是 file:// 加载，navigator.clipboard 不一定可用
  ipcMain.on('clipboard:write', (_event, text: string) => clipboard.writeText(String(text ?? '')))
  ipcMain.on('strip:resize', (_event, width: number, height: number) => {
    if (Number.isFinite(width) && Number.isFinite(height)) resizeStrip(width, height)
  })
  ipcMain.on('strip:drag-start', (_event, cursor: StripPosition) => beginStripDrag(cursor))
  ipcMain.on('strip:drag-move', (_event, cursor: StripPosition) => moveStripDrag(cursor))
  ipcMain.on('strip:drag-end', () => endStripDrag())
  ipcMain.on('app:quit', () => app.quit())

  syncLoginItem()
  applyStrip(loadSettings())
  watchDisplays()

  // 启动时什么都不弹：面板只由点托盘图标或点通知唤起。开了浮条的话上面
  // applyStrip 已经把浮条显示出来了，那就是启动后唯一可见的东西
  startPolling()
})

// 再开一个实例（双击桌面图标）意图是"把应用叫出来"，不是把它收掉
app.on('second-instance', () => {
  revealFlyout()
})

app.on('before-quit', () => {
  stopPolling()
  destroyStrip()
  tray?.destroy()
  tray = null
})

app.on('window-all-closed', () => {
  // 关闭面板窗口不等于退出，托盘仍在运行
})
