export type HidKind =
  | 'keyboard'
  | 'mouse'
  | 'consumer'
  | 'system'
  | 'battery'
  | 'vendor'
  | 'other'

export interface HidInterfaceInfo {
  id: string
  path: string
  vendorId: number
  productId: number
  vendorIdHex: string
  productIdHex: string
  product: string | null
  manufacturer: string | null
  serialNumber: string | null
  release: number | null
  interface: number | null
  usagePage: number | null
  usage: number | null
  kind: HidKind
  isVendorDefined: boolean
}

export interface HidDeviceGroup {
  key: string
  vendorId: number
  productId: number
  vendorIdHex: string
  productIdHex: string
  product: string | null
  manufacturer: string | null
  interfaces: HidInterfaceInfo[]
  hasKeyboard: boolean
  hasMouse: boolean
  hasVendorInterface: boolean
  isWirelessReceiverCandidate: boolean
}

export interface HidScanResult {
  scannedAt: string
  interfaces: HidInterfaceInfo[]
  groups: HidDeviceGroup[]
}

export interface CompxProbeResult {
  outcome: 'answered' | 'no-response' | 'error'
  cid: number | null
  mid: number | null
  online: boolean | null
  batteryPercent: number | null
  charging: boolean | null
  responses: string[]
  error?: string
}

export interface FeatureProbeResult {
  reportId: number
  hex: string | null
  error?: string
}

export type DeviceLink = '2.4g' | 'wired' | 'unknown'

export type ReadingStatus = 'ok' | 'absent' | 'unsupported' | 'error'

export interface DeviceMeasurement {
  link: DeviceLink
  status: ReadingStatus
  percent: number | null
  charging: boolean | null
  model: string | null
  note: string | null
  updatedAt: string | null
}

export interface PowerDeviceReading extends DeviceMeasurement {
  id: string
  brand: string
  name: string
  kind: 'keyboard' | 'mouse' | 'receiver'
  stale: boolean
}

export interface PowerSnapshot {
  generatedAt: string
  devices: PowerDeviceReading[]
}

export interface AppSettings {
  autoLaunch: boolean
  lowBatteryPercent: number
  soundAlert: boolean
}

export interface LowBatteryAlert {
  deviceId: string
  label: string
  percent: number
}

export interface PowerBridge {
  getSnapshot(): Promise<PowerSnapshot>
  refresh(): void
  hide(): void
  quit(): void
  resize(height: number): void
  getSettings(): Promise<AppSettings>
  saveSettings(patch: Partial<AppSettings>): Promise<AppSettings>
  onSnapshot(handler: (snapshot: PowerSnapshot) => void): () => void
  onAlert(handler: (alert: LowBatteryAlert) => void): () => void
}

export interface HidInterfaceProbe {
  label: string
  path: string
  usagePageHex: string
  usageHex: string
  compx?: CompxProbeResult
  features?: FeatureProbeResult[]
}

export interface ProbeReport {
  scan: HidScanResult
  candidates: Array<{
    group: HidDeviceGroup
    probes: HidInterfaceProbe[]
  }>
}
