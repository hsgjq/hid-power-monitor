import { app } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AppSettings } from '../shared/types'

/*
 * 设置落在 userData/settings.json，内存里再缓存一份供轮询路径同步读。
 * 开机自启走 app.setLoginItemSettings（写 HKCU 的 Run 键，不需要管理员授权），
 * 并带 --hidden：开机拉起时只进托盘，不要弹一个面板糊在屏幕上。
 * 开发态打开这个开关写进去的是 electron.exe + 项目路径，只有打包后才是有效值。
 */

const DEFAULTS: AppSettings = { autoLaunch: false, lowBatteryPercent: 15, soundAlert: true }

let cached: AppSettings | null = null

function settingsFile(): string {
  return join(app.getPath('userData'), 'settings.json')
}

function applyLoginItem(enabled: boolean): void {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    args: enabled ? ['--hidden'] : []
  })
}

export function loadSettings(): AppSettings {
  if (cached) return cached
  let stored: Partial<AppSettings> = {}
  try {
    stored = JSON.parse(readFileSync(settingsFile(), 'utf8')) as Partial<AppSettings>
  } catch {
    stored = {}
  }
  const percent = Number(stored.lowBatteryPercent)
  cached = {
    autoLaunch: stored.autoLaunch === true,
    soundAlert: stored.soundAlert !== false,
    lowBatteryPercent: Number.isFinite(percent) ? Math.min(50, Math.max(0, percent)) : DEFAULTS.lowBatteryPercent
  }
  return cached
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const next = loadSettings()
  if (typeof patch.autoLaunch === 'boolean') next.autoLaunch = patch.autoLaunch
  if (typeof patch.soundAlert === 'boolean') next.soundAlert = patch.soundAlert
  if (typeof patch.lowBatteryPercent === 'number') {
    next.lowBatteryPercent = Math.min(50, Math.max(0, Math.round(patch.lowBatteryPercent)))
  }
  cached = next
  try {
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(settingsFile(), JSON.stringify(next, null, 2), 'utf8')
  } catch {
    // 写不进磁盘时仍按内存里的值运行，下次启动回到上次落盘的配置
  }
  applyLoginItem(next.autoLaunch)
  return next
}

export function syncLoginItem(): void {
  applyLoginItem(loadSettings().autoLaunch)
}
