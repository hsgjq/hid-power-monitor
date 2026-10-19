import { app, BrowserWindow, clipboard, ipcMain } from 'electron'
import { createFlyoutWindow, resizeFlyout, showFlyout } from './flyout'
import { buildDiagnostics } from './hid/diagnostics'
import {
  beginStripDrag,
  destroyStrip,
  endStripDrag,
  moveStripDrag,
  resizeStrip,
  syncStrip
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

function toggleFlyout(point: { x: number; y: number }): void {
  if (!flyout) return
  if (flyout.isVisible()) {
    flyout.hide()
    return
  }
  showFlyout(flyout, point)
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
    if (tray) applySnapshotToTray(tray, snapshot)
    checkLowBattery(snapshot)
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

  // 开发态渲染层是 http 地址，直接在浏览器打开会没有设备读数，所以启动后自动弹一次面板
  if (!app.isPackaged && !process.argv.includes('--hidden')) {
    flyout.webContents.once('did-finish-load', () => {
      if (!tray || !flyout) return
      const bounds = tray.getBounds()
      showFlyout(flyout, { x: bounds.x + bounds.width / 2, y: bounds.y })
    })
  }

  startPolling()
})

app.on('second-instance', () => {
  if (flyout?.isVisible()) flyout.hide()
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
