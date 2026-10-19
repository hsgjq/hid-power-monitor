import { app, BrowserWindow, ipcMain } from 'electron'
import { createFlyoutWindow, showFlyout } from './flyout'
import { applySnapshotToTray, createTray } from './tray'
import { checkLowBattery } from './notify'
import { loadSettings, saveSettings, syncLoginItem } from './settings'
import { onSnapshot, pushSnapshot, startPolling, stopPolling } from './power/service'
import type { AppSettings, PowerSnapshot } from '../shared/types'

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
    if (!flyout) return
    const width = flyout.getBounds().width
    flyout.setContentSize(width, Math.round(height), false)
  })
  ipcMain.handle('settings:get', () => loadSettings())
  ipcMain.handle('settings:save', (_event, patch: Partial<AppSettings>) => saveSettings(patch))
  ipcMain.on('app:quit', () => app.quit())

  syncLoginItem()

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
  tray?.destroy()
  tray = null
})

app.on('window-all-closed', () => {
  // 关闭面板窗口不等于退出，托盘仍在运行
})
