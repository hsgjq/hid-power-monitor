import { BrowserWindow } from 'electron'
import type { PowerDeviceReading, PowerSnapshot } from '../../shared/types'
import { discoverDevices } from './registry'

/*
 * 轮询与读数缓存。设备列表每轮都重新枚举，所以插拔接收器不需要重启程序。
 */

const POLL_INTERVAL_MS = 30_000

const lastGood = new Map<string, PowerDeviceReading>()
const listeners = new Set<(snapshot: PowerSnapshot) => void>()
let timer: NodeJS.Timeout | null = null

/*
 * 这一轮没读到值时不显示 0%、也不掉回 --，而是沿用上一次真值并标 stale，
 * 界面把数字标灰、副标题写「上次 HH:MM」。两种情况会走到这里：
 * 一是设备忙或睡着（status error），二是充电中——那段时间设备根本不上报
 * 电量，provider 会把 percent 留空，需要拿接入前最后一次真值补上。
 * 设备被拔掉时整行会从列表里消失，不会留着旧读数骗人。
 */
function withCache(reading: PowerDeviceReading): PowerDeviceReading {
  if (reading.status === 'ok' && reading.percent !== null) {
    lastGood.set(reading.id, reading)
    return reading
  }

  const previous = lastGood.get(reading.id)
  if (!previous) return reading

  const needsFallback =
    reading.status === 'error' || (reading.status === 'ok' && reading.percent === null)
  if (!needsFallback) return reading

  if (reading.charging === true) {
    return { ...previous, ...reading, percent: previous.percent, charging: true, stale: true }
  }
  return { ...previous, stale: true }
}

export function readSnapshot(): PowerSnapshot {
  return {
    generatedAt: new Date().toISOString(),
    devices: discoverDevices().map(withCache)
  }
}

export function pushSnapshot(): PowerSnapshot {
  const snapshot = readSnapshot()
  for (const listener of listeners) listener(snapshot)
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('power:snapshot', snapshot)
  }
  return snapshot
}

export function onSnapshot(listener: (snapshot: PowerSnapshot) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function startPolling(): void {
  if (timer) return
  pushSnapshot()
  timer = setInterval(pushSnapshot, POLL_INTERVAL_MS)
}

export function stopPolling(): void {
  if (!timer) return
  clearInterval(timer)
  timer = null
}
