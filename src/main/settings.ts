import { app } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AppSettings, StripPosition } from '../shared/types'

/*
 * 设置落在 userData/settings.json，内存里再缓存一份供轮询路径同步读。
 * 开机自启走 app.setLoginItemSettings（写 HKCU 的 Run 键，不需要管理员授权），
 * 并带 --hidden：开机拉起时只进托盘，不要弹一个面板糊在屏幕上。
 * 开发态打开这个开关写进去的是 electron.exe + 项目路径，只有打包后才是有效值。
 * stripPosition 是桌面浮条上次被拖到的位置，由主进程在窗口移动后写回。
 */

const DEFAULTS: AppSettings = {
  autoLaunch: false,
  lowBatteryPercent: 15,
  soundAlert: true,
  stripVisible: false,
  stripPosition: null,
  stripTextColor: null
}

// 只收 #rrggbb：这个值会被直接塞进 CSS 变量，别的写法一律当默认
function normalizeColor(value: unknown): string | null {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : null
}

let cached: AppSettings | null = null

function settingsFile(): string {
  return join(app.getPath('userData'), 'settings.json')
}

function applyLoginItem(enabled: boolean): void {
  // 未打包时 process.execPath 是 electron.exe 本身、不带项目路径，写进去就是一条
  // 开机拉起"空 Electron"的坏记录；所以 dev 下既不写也不清，只在打包后才生效
  if (!app.isPackaged) return
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
  const position = stored.stripPosition as Partial<StripPosition> | null | undefined
  cached = {
    autoLaunch: stored.autoLaunch === true,
    soundAlert: stored.soundAlert !== false,
    stripVisible: stored.stripVisible === true,
    stripPosition:
      position && Number.isFinite(position.x) && Number.isFinite(position.y)
        ? { x: Math.round(position.x as number), y: Math.round(position.y as number) }
        : null,
    stripTextColor: normalizeColor(stored.stripTextColor),
    lowBatteryPercent: Number.isFinite(percent) ? Math.min(50, Math.max(0, percent)) : DEFAULTS.lowBatteryPercent
  }
  return cached
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const next = loadSettings()
  const autoLaunchBefore = next.autoLaunch
  if (typeof patch.autoLaunch === 'boolean') next.autoLaunch = patch.autoLaunch
  if (typeof patch.soundAlert === 'boolean') next.soundAlert = patch.soundAlert
  if (typeof patch.stripVisible === 'boolean') next.stripVisible = patch.stripVisible
  if ('stripPosition' in patch) next.stripPosition = patch.stripPosition ?? null
  if ('stripTextColor' in patch) next.stripTextColor = normalizeColor(patch.stripTextColor)
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
  // 只在开关真的变了才碰注册表：拖动浮条也会走这里落盘（松手一次、防抖再一次），
  // 无条件同步的话每拖一次就 setLoginItemSettings 一遍
  if (next.autoLaunch !== autoLaunchBefore) applyLoginItem(next.autoLaunch)
  return next
}

export function syncLoginItem(): void {
  applyLoginItem(loadSettings().autoLaunch)
}
