import { HID } from 'node-hid'
import type { DeviceMeasurement, HidDeviceGroup } from '../../shared/types'

/*
 * 狼蛛 SC580（接收器 248A:5B2F，泰凌方案公模 dongle）的电量读取。
 *
 * 通道是 MI_01 Col04 上 usage page 0xFF00 的 feature report 12（33 字节含 ID）。
 * 这套帧不是猜的：从厂商桌面驱动（MFC 程序，导入 HidD_SetFeature）运行时抓来的
 * ——hidclass 给每个句柄独立的输入缓冲，所以并发打开同一集合就能读到驱动自己
 * 写进设备的那帧。驱动每 ~2.5 秒发一次命令号 0x05，带数据的读命令只有 0x20。
 *
 * 只允许发 0x20 这一种帧。0x01/0x02/0x03/0x0f 是写配置（回 ack=01 空载荷就是
 * 写入成功），曾经把设备的按键映射和回报率写坏过，别再往那些命令号上发东西。
 */

const REPORT_ID = 12
const REPORT_LENGTH = 33
const COMMAND_INFO = 0x20
const BATTERY_OFFSET = 18
const CHARGING_OFFSET = 19
const MODEL_OFFSET = 8
const MODEL_LENGTH = 8

/*
 * 充电时固件把电量字节钉成 100（占位值，不是"充满了"），其余 26 个字节一个不动，
 * 所以充电期间设备实际上不上报电量。厂商驱动那段时间放的是一段装饰动画，也不是数据。
 */
const CHARGING_PLACEHOLDER = 100

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

// Col04 与 Col05 都是 0xFF00 的 feature 通道，只有 Col04 的 report 12 会回数据，
// 而 node-hid 不给报告长度信息，只能按路径里的 Col 编号选
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
  // 少于 3 个字符就当没有：型号串实测是 4 位（M137）
  return text.length >= 3 ? text : null
}

export interface AulaInfoBlock {
  percent: number | null
  charging: boolean
  model: string
}

/*
 * 一帧算不算设备的真实响应，判据是"能不能解析出自报型号串"。
 * 设备不响应时 GetFeature 会把我们刚写进去的那 33 个字节原样吐回来（后段全 0），
 * 只看命令字节位是拦不住它的——那一位是我们自己写的，漏判就会显示成 0%。
 */
export function parseInfoBlock(block: Buffer): AulaInfoBlock | null {
  if (block.length < REPORT_LENGTH) return null
  const model = readModel(block)
  if (!model) return null

  const raw = block[BATTERY_OFFSET]
  if (raw < 1 || raw > 100) return null

  return {
    charging: block[CHARGING_OFFSET] === 1,
    percent: raw === CHARGING_PLACEHOLDER && block[CHARGING_OFFSET] === 1 ? null : raw,
    model
  }
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
        // 0x1F 等设备忙/不可达时直接放弃这一轮，交给 service 沿用上一次真值
        return null
      }
      const parsed = parseInfoBlock(report)
      if (parsed) return parsed
      // 读得太急会拿到还没回填的缓冲；借这次带超时的读做 25ms 退避，不开异步
      device.readTimeout(25)
    }
    return null
  } catch {
    return null
  } finally {
    // 每次读完就关：接收器一直在用，长期占着句柄会和厂商驱动抢设备
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

  if (parsed.charging) {
    // 电量留空由 service 拿接入前那次真值补上，界面标灰显示；
    // 这里如果直接回 100，用户会以为已经充满
    return {
      link: '2.4g',
      status: 'ok',
      percent: null,
      charging: true,
      model: parsed.model,
      note: '充电中，电量暂不更新',
      updatedAt: new Date().toISOString()
    }
  }

  return {
    link: '2.4g',
    status: 'ok',
    percent: parsed.percent,
    charging: false,
    model: parsed.model,
    note: null,
    updatedAt: new Date().toISOString()
  }
}
