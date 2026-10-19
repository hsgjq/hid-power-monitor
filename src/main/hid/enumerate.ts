import { devices } from 'node-hid'
import type {
  HidDeviceGroup,
  HidInterfaceInfo,
  HidKind,
  HidScanResult
} from '../../shared/types'

/*
 * HID 枚举。一个物理接收器在 Windows 上会暴露成多个 HID 集合（鼠标、键盘、消费者
 * 控制、厂商自定义各一个），所以先按 VID:PID 归组再判断，而不是把每个接口当一台设备。
 *
 * 两个坑：node-hid 在厂商集合上可能不给 usage（undefined），要按 null 处理；
 * usage page >= 0xFF00 是自定义集合，2.4G 接收器的电量协议基本都藏在这些里面。
 */

interface RawHidDevice {
  vendorId: number
  productId: number
  path?: string
  serialNumber?: string
  manufacturer?: string
  product?: string
  release: number
  interface: number
  usagePage?: number
  usage?: number
}

export function toHex(value: number, width = 4): string {
  return value.toString(16).toUpperCase().padStart(width, '0')
}

export function classifyHidUsage(
  usagePage: number | undefined,
  usage: number | undefined
): HidKind {
  if (usagePage === undefined) return 'other'
  if (usagePage === 0x01) {
    if (usage === 0x02) return 'mouse'
    if (usage === 0x06) return 'keyboard'
    if (usage === 0x80) return 'system'
    return 'other'
  }
  if (usagePage === 0x0c) return 'consumer'
  if (usagePage === 0x06 && usage === 0x20) return 'battery'
  if (usagePage === 0x85) return 'battery'
  if (usagePage >= 0xff00) return 'vendor'
  return 'other'
}

export function listHidInterfaces(): HidInterfaceInfo[] {
  const raw = devices() as RawHidDevice[]

  return raw
    .filter((device): device is RawHidDevice & { path: string } => Boolean(device.path))
    .map((device) => {
      const usagePage = device.usagePage ?? null
      const usage = device.usage ?? null

      return {
        id: device.path,
        path: device.path,
        vendorId: device.vendorId,
        productId: device.productId,
        vendorIdHex: toHex(device.vendorId),
        productIdHex: toHex(device.productId),
        product: device.product || null,
        manufacturer: device.manufacturer || null,
        serialNumber: device.serialNumber || null,
        release: device.release ?? null,
        interface: device.interface >= 0 ? device.interface : null,
        usagePage,
        usage,
        kind: classifyHidUsage(usagePage ?? undefined, usage ?? undefined),
        isVendorDefined: usagePage !== null && usagePage >= 0xff00
      }
    })
    .sort((a, b) => {
      if (a.vendorId !== b.vendorId) return a.vendorId - b.vendorId
      if (a.productId !== b.productId) return a.productId - b.productId
      if (a.interface !== b.interface) return (a.interface ?? -1) - (b.interface ?? -1)
      return (a.usagePage ?? 0) - (b.usagePage ?? 0)
    })
}

function looksLikeWirelessReceiver(
  product: string | null,
  manufacturer: string | null,
  hasKeyboard: boolean,
  hasMouse: boolean,
  hasVendorInterface: boolean
): boolean {
  if (!hasVendorInterface) return false
  const text = `${product ?? ''} ${manufacturer ?? ''}`.toLowerCase()
  if (text.includes('wireless') || text.includes('receiver') || text.includes('dongle')) {
    return true
  }
  if (text.includes('2.4g')) return true
  return (hasKeyboard || hasMouse) && manufacturer === 'Compx'
}

export function groupHidDevices(interfaces: HidInterfaceInfo[]): HidDeviceGroup[] {
  const groups = new Map<string, HidDeviceGroup>()

  for (const item of interfaces) {
    const key = [
      item.vendorIdHex,
      item.productIdHex,
      item.manufacturer ?? '',
      item.product ?? ''
    ].join(':')

    let group = groups.get(key)
    if (!group) {
      group = {
        key,
        vendorId: item.vendorId,
        productId: item.productId,
        vendorIdHex: item.vendorIdHex,
        productIdHex: item.productIdHex,
        product: item.product,
        manufacturer: item.manufacturer,
        interfaces: [],
        hasKeyboard: false,
        hasMouse: false,
        hasVendorInterface: false,
        isWirelessReceiverCandidate: false
      }
      groups.set(key, group)
    }

    group.interfaces.push(item)
    group.hasKeyboard ||= item.kind === 'keyboard'
    group.hasMouse ||= item.kind === 'mouse'
    group.hasVendorInterface ||= item.isVendorDefined
  }

  for (const group of groups.values()) {
    group.isWirelessReceiverCandidate = looksLikeWirelessReceiver(
      group.product,
      group.manufacturer,
      group.hasKeyboard,
      group.hasMouse,
      group.hasVendorInterface
    )
  }

  return [...groups.values()].sort((a, b) => {
    if (a.isWirelessReceiverCandidate !== b.isWirelessReceiverCandidate) {
      return a.isWirelessReceiverCandidate ? -1 : 1
    }
    if (a.vendorId !== b.vendorId) return a.vendorId - b.vendorId
    return a.productId - b.productId
  })
}

export function scanHidDevices(): HidScanResult {
  const interfaces = listHidInterfaces()

  return {
    scannedAt: new Date().toISOString(),
    interfaces,
    groups: groupHidDevices(interfaces)
  }
}
