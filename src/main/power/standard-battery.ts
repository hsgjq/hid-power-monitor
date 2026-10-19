import { HID } from 'node-hid'
import type { DeviceMeasurement, HidDeviceGroup } from '../../shared/types'

/*
 * 标准 HID 电池 provider：读那些按 HID 规范暴露电池的集合（usage page 0x85 电池系统，
 * 或 Generic Device Controls 0x06 + usage 0x20），不少蓝牙键盘/接收器走这条正路，
 * 不需要任何厂商私有协议。
 *
 * 为什么不做"扫第一个 1..100 的字节当电量"那种启发式：那块报告里也可能是温度、
 * 剩余 mAh、告警等级，随便挑一个就会给出看着像真的错数字。node-hid 不暴露
 * HidP_GetValueCaps，拿不到 usage 到 bit 偏移的映射，所以这里只在**形状唯一符合规范里
 * Battery Strength 那一格**（报告 ID + 恰好 1 字节数据、值在 1..100）时才出数，
 * 其余情况一律返回未知，让界面显示 --。
 *
 * 长度探测是安全的：Windows 会拿 caps 里的 FeatureReportByteLength 校验，长度不对直接
 * 回 0x57，所以"哪个长度读得通"本身就是设备给出的信息，全程不发写请求。
 */

const MAX_PROBE_LENGTH = 65
const MIN_PROBE_LENGTH = 2

export function isStandardBatteryGroup(group: HidDeviceGroup): boolean {
  return group.interfaces.some(
    (item) => item.usagePage === 0x85 || (item.usagePage === 0x06 && item.usage === 0x20)
  )
}

function batteryPaths(group: HidDeviceGroup): string[] {
  return group.interfaces
    .filter(
      (item) => item.usagePage === 0x85 || (item.usagePage === 0x06 && item.usage === 0x20)
    )
    .map((item) => item.path)
}

export interface FeatureRead {
  length: number
  data: number[]
}

/*
 * 纯判定：只有"恰好一个长度读得通，且那个长度就是 报告 ID + 1 字节"时才认它是
 * Battery Strength。多长度可读说明设备没在严格校验报告长度，"能读通"就不再携带
 * 任何形状信息；单字节之外的布局我们没法把某个字节归给某个 usage，所以宁可未知。
 */
export function pickBatteryValue(reads: FeatureRead[]): number | null {
  if (reads.length !== 1) return null

  const [only] = reads
  if (only.length !== MIN_PROBE_LENGTH) return null

  const value = only.data[1] ?? null
  if (value === null || value < 1 || value > 100) return null
  return value
}

function probeFeatureReads(path: string): FeatureRead[] {
  let device: HID
  try {
    device = new HID(path)
  } catch {
    return []
  }

  const reads: FeatureRead[] = []
  try {
    for (let length = MIN_PROBE_LENGTH; length <= MAX_PROBE_LENGTH; length += 1) {
      try {
        const data = Buffer.from(device.getFeatureReport(0, length))
        reads.push({ length, data: Array.from(data) })
      } catch {
        // 长度不合法（0x57）或设备忙（0x1F）都是预期内的，继续试下一个
      }
    }
  } finally {
    device.close()
  }
  return reads
}

export function measureStandardBattery(group: HidDeviceGroup): DeviceMeasurement | null {
  for (const path of batteryPaths(group)) {
    const percent = pickBatteryValue(probeFeatureReads(path))
    if (percent !== null) {
      return {
        link: 'unknown',
        status: 'ok',
        percent,
        // 规范里的 Charging/Discharging 位要靠 value caps 定位，这里拿不到，
        // 所以只报电量不报充电状态，避免猜错
        charging: null,
        model: null,
        note: null,
        updatedAt: new Date().toISOString()
      }
    }
  }
  return null
}
