import { HID } from 'node-hid'
import type { DeviceMeasurement, HidDeviceGroup } from '../../shared/types'

const REPORT_ID = 12
const REPORT_LENGTH = 33
const COMMAND_INFO = 0x20
const BATTERY_OFFSET = 18
const CHARGING_OFFSET = 19
const MODEL_OFFSET = 8
const MODEL_LENGTH = 8

let seq = 0

function frame(): number[] {
  const data = new Array(REPORT_LENGTH).fill(0)
  data[0] = REPORT_ID
  data[1] = 0x01
  data[2] = COMMAND_INFO
  data[4] = (seq = (seq + 1) & 0xff)
  data[5] = 0x01
  return data
}

function commandChannel(group: HidDeviceGroup): string | null {
  return group.interfaces.find((item) => item.usagePage === 0xff00 && item.path.includes('Col04'))
    ?.path
    ?? null
}

function readModel(block: Buffer): string | null {
  let text = ''
  for (let i = MODEL_OFFSET; i < MODEL_OFFSET + MODEL_LENGTH; i += 1) {
    const byte = block[i]
    if (byte < 0x30 || byte > 0x7a) break
    text += String.fromCharCode(byte)
  }
  return text.length >= 3 ? text : null
}

export interface AulaInfoBlock {
  percent: number
  charging: boolean | null
  model: string
}

// 读不到数据时 GetFeature 会把我们刚写进去的空帧原样吐回来，
// 所以只有能解析出自报型号、且百分比合法的帧才算响应
export function parseInfoBlock(block: Buffer): AulaInfoBlock | null {
  if (block.length < REPORT_LENGTH) return null
  const model = readModel(block)
  if (!model) return null

  const percent = block[BATTERY_OFFSET]
  if (percent < 1 || percent > 100) return null

  return { percent, charging: block[CHARGING_OFFSET] === 1 ? true : null, model }
}

function readInfoBlock(path: string): AulaInfoBlock | null {
  let device: HID
  try {
    device = new HID(path)
  } catch {
    return null
  }

  try {
    device.sendFeatureReport(frame())
    for (let attempt = 0; attempt < 6; attempt += 1) {
      let report: Buffer
      try {
        report = Buffer.from(device.getFeatureReport(REPORT_ID, REPORT_LENGTH))
      } catch {
        return null
      }
      const parsed = parseInfoBlock(report)
      if (parsed) return parsed
      device.readTimeout(25)
    }
    return null
  } catch {
    return null
  } finally {
    device.close()
  }
}

export function measureAulaMouse(group: HidDeviceGroup): DeviceMeasurement {
  const idle: DeviceMeasurement = {
    link: '2.4g',
    status: 'error',
    percent: null,
    charging: null,
    model: null,
    note: '接收器没有响应电量查询',
    updatedAt: null
  }

  const path = commandChannel(group)
  if (!path) return { ...idle, note: '找不到电量通道' }

  const parsed = readInfoBlock(path)
  if (!parsed) return { ...idle, note: '没读到数据，鼠标可能在休眠' }

  return {
    link: '2.4g',
    status: 'ok',
    percent: parsed.percent,
    charging: parsed.charging,
    model: parsed.model,
    note: null,
    updatedAt: new Date().toISOString()
  }
}
