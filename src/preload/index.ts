import { contextBridge, ipcRenderer } from 'electron'
import type { AppSettings, LowBatteryAlert, PowerBridge, PowerSnapshot } from '../shared/types'

const api: PowerBridge = {
  getSnapshot(): Promise<PowerSnapshot> {
    return ipcRenderer.invoke('power:get-snapshot')
  },
  refresh(): void {
    ipcRenderer.send('power:refresh')
  },
  hide(): void {
    ipcRenderer.send('flyout:hide')
  },
  quit(): void {
    ipcRenderer.send('app:quit')
  },
  resize(height: number): void {
    ipcRenderer.send('flyout:resize', height)
  },
  getSettings(): Promise<AppSettings> {
    return ipcRenderer.invoke('settings:get')
  },
  saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    return ipcRenderer.invoke('settings:save', patch)
  },
  onSnapshot(handler: (snapshot: PowerSnapshot) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: PowerSnapshot): void => {
      handler(snapshot)
    }
    ipcRenderer.on('power:snapshot', listener)
    return () => ipcRenderer.removeListener('power:snapshot', listener)
  },
  onAlert(handler: (alert: LowBatteryAlert) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, alert: LowBatteryAlert): void => {
      handler(alert)
    }
    ipcRenderer.on('power:alert', listener)
    return () => ipcRenderer.removeListener('power:alert', listener)
  }
}

contextBridge.exposeInMainWorld('power', api)
