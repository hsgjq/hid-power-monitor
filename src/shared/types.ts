/*
 * 主进程与渲染层共用的类型。
 * percent 为 null 表示"这一轮没有可信读数"，界面显示 --，绝不用 0 或上次的值冒充；
 * stale 是另一个维度：值还是上一次的真值，只是这一轮没刷新，界面标灰并写「上次 HH:MM」。
 * updatedAt 记的是"设备最后一次给出不同内容"的时刻，不是"我们最后一次读通"的时刻：
 * 鼠标插拔之后设备自己也要 20~60 秒才把新状态推上来，这期间反复读到的都是同一帧缓存。
 */

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

export type ReadingStatus = 'ok' | 'unsupported' | 'error'

/*
 * 插着电时设备自己怎么说：'charging' 还在充（这时候电量位往往是钉死的，给不出可信数字），
 * 'full' 已经充满。只有 charging 为 true 时才有意义，读不出这一层的设备留空，界面退回"充电中"。
 */
export type ChargeLevel = 'charging' | 'full'

export interface DeviceMeasurement {
  link: DeviceLink
  status: ReadingStatus
  percent: number | null
  charging: boolean | null
  chargeLevel?: ChargeLevel | null
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

export interface StripPosition {
  x: number
  y: number
}

export interface AppSettings {
  autoLaunch: boolean
  lowBatteryPercent: number
  soundAlert: boolean
  stripVisible: boolean
  stripPosition: StripPosition | null
  stripTextColor: string | null
}

export interface LowBatteryAlert {
  deviceId: string
  label: string
  percent: number
}

export interface HidCollectionSummary {
  usagePage: string
  usage: string
  kind: HidKind
}

export interface HidDiagnosticsGroup {
  id: string
  manufacturer: string | null
  product: string | null
  interfaceCount: number
  shown: boolean
  reason: string
  collections: HidCollectionSummary[]
}

export interface HidDiagnostics {
  generatedAt: string
  groups: HidDiagnosticsGroup[]
}

export interface RuntimeFlags {
  loginItemSupported: boolean
}

export interface PowerBridge {
  getSnapshot(): Promise<PowerSnapshot>
  refresh(): void
  hide(): void
  quit(): void
  resize(height: number): void
  resizeStrip(width: number, height: number): void
  beginStripDrag(cursor: StripPosition): void
  moveStripDrag(cursor: StripPosition): void
  endStripDrag(): void
  getSettings(): Promise<AppSettings>
  getRuntimeFlags(): Promise<RuntimeFlags>
  saveSettings(patch: Partial<AppSettings>): Promise<AppSettings>
  getDiagnostics(): Promise<HidDiagnostics>
  copyText(text: string): void
  onSnapshot(handler: (snapshot: PowerSnapshot) => void): () => void
  onSettings(handler: (settings: AppSettings) => void): () => void
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
