import { Menu, Tray, nativeImage } from 'electron'
import type { NativeImage } from 'electron'
import type { PowerSnapshot } from '../shared/types'

/*
 * 托盘图标不放静态资源：按两台设备里较低的那块电量逐像素画一张 32x32 BGRA 位图。
 * 位图要交给 nativeImage.createFromBitmap——createFromBuffer 只收已编码图片（PNG/JPEG），
 * 喂 raw 位图会得到一张空图标。白色描边外加一圈半透明深色底，是为了浅色任务栏上
 * 也看得见；读不到电量时只画外壳，跟"0%"要能区分开。
 */

const SIZE = 32
const LIGHT: Rgb = { r: 236, g: 239, b: 243 }
const DARK: Rgb = { r: 12, g: 13, b: 16 }
const CHARGING: Rgb = { r: 108, g: 208, b: 140 }
const LOW: Rgb = { r: 232, g: 106, b: 92 }

interface Rgb {
  r: number
  g: number
  b: number
}

function put(buf: Buffer, x: number, y: number, color: Rgb, alpha: number): void {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return
  const i = (y * SIZE + x) * 4
  buf[i] = color.b
  buf[i + 1] = color.g
  buf[i + 2] = color.r
  buf[i + 3] = alpha
}

function fill(
  buf: Buffer,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: Rgb,
  alpha: number
): void {
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) put(buf, x, y, color, alpha)
  }
}

function ring(buf: Buffer, x0: number, y0: number, x1: number, y1: number, color: Rgb): void {
  fill(buf, x0, y0, x1, y0, color, 255)
  fill(buf, x0, y1, x1, y1, color, 255)
  fill(buf, x0, y0 + 1, x0, y1 - 1, color, 255)
  fill(buf, x1, y0 + 1, x1, y1 - 1, color, 255)
}

export function drawBatteryIcon(
  percent: number | null,
  charging: boolean,
  lowAt: number
): NativeImage {
  const buf = Buffer.alloc(SIZE * SIZE * 4)

  fill(buf, 2, 9, 26, 24, DARK, 215)
  fill(buf, 4, 11, 24, 22, { r: 0, g: 0, b: 0 }, 0)
  fill(buf, 26, 14, 28, 19, DARK, 215)
  fill(buf, 27, 15, 28, 18, { r: 0, g: 0, b: 0 }, 0)

  ring(buf, 4, 11, 24, 22, LIGHT)
  fill(buf, 27, 15, 28, 18, LIGHT, 255)

  if (percent !== null) {
    const innerWidth = 24 - 4 - 2
    const filled = Math.max(1, Math.round((innerWidth * Math.min(100, Math.max(0, percent))) / 100))
    // 低电分界用用户在设置里调的那个值；<=0 是"关闭提醒"，这时不该有任何东西标红
    const color = charging ? CHARGING : lowAt > 0 && percent <= lowAt ? LOW : LIGHT
    fill(buf, 6, 13, 6 + filled - 1, 20, color, 255)
  }

  return nativeImage.createFromBitmap(buf, { width: SIZE, height: SIZE })
}

function formatTooltip(snapshot: PowerSnapshot): string {
  const parts = snapshot.devices.map((device) => {
    const value = device.percent === null ? '--' : `${device.percent}%`
    return `${device.brand}${device.name.replace('无线', '')} ${value}`
  })
  return `2.4G 设备电量  ${parts.join('  |  ')}`
}

export function createTray(
  onToggle: (position: { x: number; y: number }) => void,
  onRefresh: () => void,
  onQuit: () => void
): Tray {
  // 还没有读数时 lowAt 传 0：这一张只画外壳
  const tray = new Tray(drawBatteryIcon(null, false, 0))
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '刷新', click: onRefresh },
      { type: 'separator' },
      { label: '退出', click: onQuit }
    ])
  )
  tray.on('click', () => {
    const bounds = tray.getBounds()
    onToggle({ x: bounds.x + bounds.width / 2, y: bounds.y })
  })
  return tray
}

export function applySnapshotToTray(
  tray: Tray,
  snapshot: PowerSnapshot,
  lowAt: number
): void {
  const known = snapshot.devices.filter((device) => device.percent !== null)
  const worst = known.reduce<number | null>((acc, device) => {
    if (device.percent === null) return acc
    return acc === null ? device.percent : Math.min(acc, device.percent)
  }, null)
  const charging = known.some((device) => device.charging === true)
  tray.setImage(drawBatteryIcon(worst, charging, lowAt))
  tray.setToolTip(formatTooltip(snapshot))
}
