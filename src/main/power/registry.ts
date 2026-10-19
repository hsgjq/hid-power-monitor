import type {
  DeviceMeasurement,
  HidDeviceGroup,
  PowerDeviceReading
} from '../../shared/types'
import { groupHidDevices, listHidInterfaces, toHex } from '../hid/enumerate'
import { measureAulaMouse } from './aula'
import { measureMchoseKeyboard } from './mchose'

/*
 * 设备登记表：这里是"叫什么、是键盘还是鼠标"的唯一出处。
 * provider 只回测量值（DeviceMeasurement），不参与命名，加一台新设备就是加一行表项
 * 加一个 measure 函数。表外的 2.4G 接收器也会自动出现在列表里，只是名字只能用系统
 * 给的厂商串/产品串兜底、电量显示未识别——不做静默忽略，否则用户会以为程序没工作。
 */

interface DeviceEntry {
  vendorId: number
  productId: number
  brand: string
  name: string
  kind: 'keyboard' | 'mouse' | 'receiver'
  measure: (group: HidDeviceGroup) => DeviceMeasurement
}

// 这一张表是唯一的"设备叫什么"来源；协议读取器只负责量出电量，不参与命名
const devices: DeviceEntry[] = [
  {
    vendorId: 0x05ac,
    productId: 0x024f,
    brand: '迈从',
    name: '无线键盘',
    kind: 'keyboard',
    measure: measureMchoseKeyboard
  },
  {
    vendorId: 0x248a,
    productId: 0x5b2f,
    brand: '狼蛛',
    name: '无线鼠标',
    kind: 'mouse',
    measure: measureAulaMouse
  }
]

function identify(group: HidDeviceGroup): string {
  return `${toHex(group.vendorId)}:${toHex(group.productId)}`
}

// 表外的接收器也要能出现：名字只能用系统给到的厂商串/产品串兜底
function unknownDevice(group: HidDeviceGroup): PowerDeviceReading {
  return {
    id: identify(group),
    brand: group.manufacturer ?? '',
    name: group.product ?? '未识别的接收器',
    kind: 'receiver',
    stale: false,
    link: 'unknown',
    status: 'unsupported',
    percent: null,
    charging: null,
    model: null,
    note: '未识别到电量通道',
    updatedAt: null
  }
}

export function discoverDevices(): PowerDeviceReading[] {
  const readings: PowerDeviceReading[] = []

  for (const group of groupHidDevices(listHidInterfaces())) {
    const entry = devices.find(
      (item) => item.vendorId === group.vendorId && item.productId === group.productId
    )
    if (entry) {
      readings.push({ id: identify(group), brand: entry.brand, name: entry.name, kind: entry.kind, stale: false, ...entry.measure(group) })
      continue
    }
    if (group.isWirelessReceiverCandidate) readings.push(unknownDevice(group))
  }

  const known = new Set(devices.map((item) => `${toHex(item.vendorId)}:${toHex(item.productId)}`))
  return readings.sort((a, b) => {
    const aKnown = known.has(a.id)
    const bKnown = known.has(b.id)
    if (aKnown !== bKnown) return aKnown ? -1 : 1
    return `${a.brand}${a.name}`.localeCompare(`${b.brand}${b.name}`, 'zh-CN')
  })
}
