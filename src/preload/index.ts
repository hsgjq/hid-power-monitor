import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppSettings,
  HidDiagnostics,
  LowBatteryAlert,
  PowerBridge,
  PowerSnapshot,
  RuntimeFlags
} from '../shared/types'

/*
 * 只暴露这几个方法，不把 ipcRenderer 本身递出去：渲染层能调什么由这里穷举，
 * 频道名写错会在类型上报错，而不是运行时静默失败。
 */

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
  resizeStrip(width: number, height: number): void {
    ipcRenderer.send('strip:resize', width, height)
  },
  getSettings(): Promise<AppSettings> {
    return ipcRenderer.invoke('settings:get')
  },
  getRuntimeFlags(): Promise<RuntimeFlags> {
    return ipcRenderer.invoke('runtime:flags')
  },
  saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    return ipcRenderer.invoke('settings:save', patch)
  },
  getDiagnostics(): Promise<HidDiagnostics> {
    return ipcRenderer.invoke('diagnostics:get')
  },
  copyText(text: string): void {
    ipcRenderer.send('clipboard:write', text)
  },
  onSnapshot(handler: (snapshot: PowerSnapshot) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: PowerSnapshot): void => {
      handler(snapshot)
    }
    ipcRenderer.on('power:snapshot', listener)
    return () => ipcRenderer.removeListener('power:snapshot', listener)
  },
  onSettings(handler: (settings: AppSettings) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, settings: AppSettings): void => {
      handler(settings)
    }
    ipcRenderer.on('settings:changed', listener)
    return () => ipcRenderer.removeListener('settings:changed', listener)
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
