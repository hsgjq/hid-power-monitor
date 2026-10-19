import { BrowserWindow, Notification } from 'electron'
import type { LowBatteryAlert, PowerSnapshot } from '../shared/types'
import { loadSettings } from './settings'

const HYSTERESIS = 5
const alerted = new Set<string>()

function emitAlert(alert: LowBatteryAlert): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('power:alert', alert)
  }
}

export function checkLowBattery(snapshot: PowerSnapshot): void {
  const { lowBatteryPercent, soundAlert } = loadSettings()
  if (lowBatteryPercent <= 0) {
    alerted.clear()
    return
  }

  for (const device of snapshot.devices) {
    if (device.percent === null) continue

    if (device.percent <= lowBatteryPercent) {
      if (alerted.has(device.id)) continue
      alerted.add(device.id)
      const label = `${device.brand}${device.name}`
      const alert: LowBatteryAlert = { deviceId: device.id, label, percent: device.percent }
      new Notification({
        title: `${label}电量低`,
        body: `剩余 ${device.percent}%，记得充电`
      }).show()
      if (soundAlert) emitAlert(alert)
    } else if (device.percent >= lowBatteryPercent + HYSTERESIS) {
      alerted.delete(device.id)
    }
  }
}
