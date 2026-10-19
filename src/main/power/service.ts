import { BrowserWindow } from 'electron'
import type { PowerDeviceReading, PowerSnapshot } from '../../shared/types'
import { discoverDevices } from './registry'

const POLL_INTERVAL_MS = 30_000

const lastGood = new Map<string, PowerDeviceReading>()
const listeners = new Set<(snapshot: PowerSnapshot) => void>()
let timer: NodeJS.Timeout | null = null

function withCache(reading: PowerDeviceReading): PowerDeviceReading {
  if (reading.status === 'ok') {
    lastGood.set(reading.id, reading)
    return reading
  }
  const previous = lastGood.get(reading.id)
  if (previous && reading.status === 'error') {
    return { ...previous, stale: true }
  }
  return reading
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
