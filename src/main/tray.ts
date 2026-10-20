import { Menu, Tray, nativeImage } from 'electron'
import type { NativeImage } from 'electron'
import type { PowerDeviceReading, PowerSnapshot } from '../shared/types'

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
  lowAt: number,
  stale = false
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
    /*
     * 充电优先于"这轮没读到"，和面板、浮条同一口径：那截数字是沿用的，但充电这件事
     * 是设备当场报的。剩下两种状态色只认真读数，沿用旧值时把填充画暗一档就够了。
     * 低电分界用用户在设置里调的那个值；lowAt <= 0 是"关闭提醒"，这时不标红。
     */
    let color = LIGHT
    if (charging) color = CHARGING
    else if (!stale && lowAt > 0 && percent <= lowAt) color = LOW
    fill(buf, 6, 13, 6 + filled - 1, 20, color, charging || !stale ? 255 : 120)
  }

  return nativeImage.createFromBitmap(buf, { width: SIZE, height: SIZE })
}

function formatTooltip(snapshot: PowerSnapshot): string {
  const parts = snapshot.devices.map((device) => {
    const value = device.percent === null ? '--' : `${device.percent}%`
    const flag =
      device.charging === true
        ? device.chargeLevel === 'full'
          ? ' 已充满'
          : ' 充电中'
        : device.stale
          ? ' 上次读数'
          : ''
    return `${device.brand}${device.name.replace('无线', '')} ${value}${flag}`
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

/*
 * 图标只能表达一块电池，取有读数里最低的那块；返回的是设备本身而不是一个百分比，
 * 因为"充电/低电/旧值"这三个标记必须跟这一块自己的状态走。
 */
function lowestDevice(devices: PowerDeviceReading[]): PowerDeviceReading | null {
  let lowest: PowerDeviceReading | null = null
  for (const device of devices) {
    if (device.percent === null) continue
    if (lowest === null || device.percent < (lowest.percent ?? Infinity)) lowest = device
  }
  return lowest
}

export function applySnapshotToTray(
  tray: Tray,
  snapshot: PowerSnapshot,
  lowAt: number
): void {
  const worst = lowestDevice(snapshot.devices)

  tray.setImage(
    drawBatteryIcon(worst?.percent ?? null, worst?.charging === true, lowAt, worst?.stale === true)
  )
  tray.setToolTip(formatTooltip(snapshot))
}
