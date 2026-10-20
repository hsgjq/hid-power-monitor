import { BrowserWindow, Notification } from 'electron'
import type { LowBatteryAlert, PowerSnapshot } from '../shared/types'
import { loadSettings } from './settings'

/*
 * 低电量提醒。轮询是 30 秒一轮，所以必须去重：一台设备跌破阈值只发一次，
 * 要回升到阈值 + HYSTERESIS 以上才重新武装，否则会持续刷屏。
 * 读不到数（percent 为 null）和沿用旧值的 stale 读数都不触发，避免拿旧数据误报。
 */

const HYSTERESIS = 5
const alerted = new Set<string>()

function emitAlert(alert: LowBatteryAlert): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('power:alert', alert)
  }
}

export function checkLowBattery(snapshot: PowerSnapshot, onOpen: () => void): void {
  const { lowBatteryPercent, soundAlert } = loadSettings()
  if (lowBatteryPercent <= 0) {
    alerted.clear()
    return
  }

  // 本轮已经不存在的设备要从去重集合里放掉：滞回是为了防刷屏，不是永久静音。
  // 一块 10% 的鼠标拔掉再插回来，应该能再提醒一次
  const present = new Set(snapshot.devices.map((device) => device.id))
  for (const id of [...alerted]) {
    if (!present.has(id)) alerted.delete(id)
  }

  for (const device of snapshot.devices) {
    if (device.percent === null) continue
    // 沿用上一次真值的读数不参与提醒：那数字已经不作数了，拿它弹"记得充电"就是拿旧数据误报。
    // 这里 continue 而不是 else 分支，所以提醒的重新武装只由真读数决定
    if (device.stale) continue

    if (device.percent <= lowBatteryPercent) {
      if (alerted.has(device.id)) continue
      alerted.add(device.id)
      const label = `${device.brand}${device.name}`
      const alert: LowBatteryAlert = { deviceId: device.id, label, percent: device.percent }
      const notification = new Notification({
        title: `${label}电量低`,
        body: `剩余 ${device.percent}%，记得充电`
      })
      notification.on('click', onOpen)
      notification.show()
      if (soundAlert) emitAlert(alert)
    } else if (device.percent >= lowBatteryPercent + HYSTERESIS) {
      alerted.delete(device.id)
    }
  }
}
