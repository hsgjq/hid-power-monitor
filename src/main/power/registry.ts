import type {
  DeviceMeasurement,
  HidDeviceGroup,
  PowerDeviceReading
} from '../../shared/types'
import { groupHidDevices, listHidInterfaces, toHex } from '../hid/enumerate'
import { measureAulaMouse } from './aula'
import { isStandardBatteryGroup, measureStandardBattery } from './standard-battery'
import { measureMchoseKeyboard } from './mchose'

/*
 * 设备登记表：这里是"叫什么、是键盘还是鼠标"的唯一出处。
 * provider 只回测量值（DeviceMeasurement），不参与命名，加一台新设备就是加一行表项
 * 加一个 measure 函数。
 *
 * 一台设备最终显不显示、按什么协议读，全部走 classifyGroup 这一个判断口——
 * 诊断清单也复用它，避免"面板不显示但诊断说该显示"这种两处逻辑不一致。
 */

interface DeviceEntry {
  vendorId: number
  productId: number
  brand: string
  name: string
  kind: 'keyboard' | 'mouse' | 'receiver'
  measure: (group: HidDeviceGroup) => DeviceMeasurement
}

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

export type GroupDisposition =
  | { mode: 'provider'; entry: DeviceEntry }
  | { mode: 'standard-battery'; entry: null }
  | { mode: 'unrecognized' }
  | { mode: 'hidden'; reason: string }

export function identify(group: HidDeviceGroup): string {
  return `${toHex(group.vendorId)}:${toHex(group.productId)}`
}

// 只有"字符串像接收器"或"有标准电池集合 + 有键鼠集合"才算外接外设。
// 单看 hasMouse/hasKeyboard 会把笔记本的触摸板、触摸屏（HIDI2C 也暴露指针集合）
// 当成设备列进面板——诊断清单第一次跑就抓到 4 组这种噪声。
export function classifyGroup(group: HidDeviceGroup): GroupDisposition {
  const entry = devices.find(
    (item) => item.vendorId === group.vendorId && item.productId === group.productId
  )
  if (entry) return { mode: 'provider', entry }

  if (isStandardBatteryGroup(group)) {
    return group.isWirelessReceiverCandidate || group.hasKeyboard || group.hasMouse
      ? { mode: 'standard-battery', entry: null }
      : { mode: 'hidden', reason: '有标准电池集合，但不像外接键鼠' }
  }

  if (group.isWirelessReceiverCandidate) return { mode: 'unrecognized' }
  return { mode: 'hidden', reason: '没有厂商自定义集合，字符串也不像 2.4G 接收器' }
}

export function dispositionLabel(disposition: GroupDisposition): string {
  switch (disposition.mode) {
    case 'provider':
      return '已登记协议'
    case 'standard-battery':
      return '标准 HID 电池'
    case 'unrecognized':
      return '像接收器，但没有电量协议'
    case 'hidden':
      return disposition.reason
  }
}

function labelFor(group: HidDeviceGroup, entry: DeviceEntry | null): {
  brand: string
  name: string
  kind: 'keyboard' | 'mouse' | 'receiver'
} {
  if (entry) return { brand: entry.brand, name: entry.name, kind: entry.kind }
  return {
    brand: group.manufacturer ?? '',
    name: group.product ?? '未识别的接收器',
    kind: 'receiver'
  }
}

function unrecognizedReading(group: HidDeviceGroup): PowerDeviceReading {
  return {
    id: identify(group),
    ...labelFor(group, null),
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
    const disposition = classifyGroup(group)
    const id = identify(group)

    if (disposition.mode === 'provider') {
      const { entry } = disposition
      readings.push({ id, brand: entry.brand, name: entry.name, kind: entry.kind, stale: false, ...entry.measure(group) })
      continue
    }

    if (disposition.mode === 'standard-battery') {
      const measured = measureStandardBattery(group)
      if (measured) {
        readings.push({ id, ...labelFor(group, null), stale: false, ...measured })
        continue
      }
      readings.push(unrecognizedReading(group))
      continue
    }

    if (disposition.mode === 'unrecognized') readings.push(unrecognizedReading(group))
  }

  const known = new Set(devices.map((item) => `${toHex(item.vendorId)}:${toHex(item.productId)}`))
  return readings.sort((a, b) => {
    const aKnown = known.has(a.id)
    const bKnown = known.has(b.id)
    if (aKnown !== bKnown) return aKnown ? -1 : 1
    return `${a.brand}${a.name}`.localeCompare(`${b.brand}${b.name}`, 'zh-CN')
  })
}
