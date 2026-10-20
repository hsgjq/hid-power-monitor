import { HID } from 'node-hid'
import type { ChargeLevel, DeviceMeasurement, HidDeviceGroup } from '../../shared/types'

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
 *
 * 读到的其实是接收器里缓存的最后一帧：插拔之后设备自己也要 20~60 秒才把新状态推上来
 * （实测 20 / 24 / 58 秒各一次），所以帧内容没变就不该把时间戳往前推。
 */

const REPORT_ID = 12
const REPORT_LENGTH = 33
const COMMAND_INFO = 0x20
const BATTERY_OFFSET = 18
const CHARGING_OFFSET = 19
const MODEL_OFFSET = 8
const MODEL_LENGTH = 8
const SEQ_OFFSET = 4

/*
 * 充电位（idx19）实测是三个值，跟上面那些命令号没关系（18:39~19:42 连着做了三次插拔采出来的）：
 * 0 = 没插电，1 = 正在充电，2 = 插着且已经充满。
 * 1 的时候电量位被钉死成 100（三帧全是 1+100，从没给过别的数），这段时间设备其实不上报电量；
 * 2 的时候 100 是当场真值——拔掉之后它照样报 100，因为电池确实是满的，所以不能把 100 一律当假。
 */
const CHARGE_NONE = 0
const CHARGE_FULL = 2

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

/*
 * 自报型号串是这一帧唯一的身份判据（parseInfoBlock 靠它拦下设备没响应的情况），
 * 所以取值要收得紧：实测是 "M137" 这种数字加大写字母。放宽到任意可打印字符，
 * 一小串垃圾字节就能冒充型号，界面会凭空多出一个型号、读数也一起被当成真的。
 */
function isModelByte(byte: number): boolean {
  return (byte >= 0x30 && byte <= 0x39) || (byte >= 0x41 && byte <= 0x5a)
}

function readModel(block: Buffer): string | null {
  let text = ''
  for (let i = MODEL_OFFSET; i < MODEL_OFFSET + MODEL_LENGTH; i += 1) {
    const byte = block[i]
    if (!isModelByte(byte)) break
    text += String.fromCharCode(byte)
  }
  // 少于 3 个字符就当没有：型号串实测是 4 位（M137）
  return text.length >= 3 ? text : null
}

export interface AulaInfoBlock {
  percent: number | null
  charging: boolean
  level: ChargeLevel | null
  model: string
  at: string
}

/*
 * 一帧算不算设备的真实响应，判据是"能不能解析出自报型号串"。
 * 设备不响应时 GetFeature 会把我们刚写进去的那 33 个字节原样吐回来（后段全 0），
 * 只看命令字节位是拦不住它的——那一位是我们自己写的，漏判就会显示成 0%。
 */
export function parseInfoBlock(block: Buffer): Omit<AulaInfoBlock, 'at'> | null {
  if (block.length < REPORT_LENGTH) return null
  const model = readModel(block)
  if (!model) return null

  const raw = block[BATTERY_OFFSET]
  // 0 是合法读数（电量真见底了），不能和"没读到"混成一堆；冒牌帧由上面的型号串拦掉
  if (raw > 100) return null

  const charge = block[CHARGING_OFFSET]
  return {
    // 除 0 之外都算"插着电"；数字只认实测过的 0 和 2 这两态，看不懂的取值宁缺不假
    charging: charge !== CHARGE_NONE,
    level: charge === CHARGE_NONE ? null : charge === CHARGE_FULL ? 'full' : 'charging',
    percent: charge === CHARGE_FULL || charge === CHARGE_NONE ? raw : null,
    model
  }
}

/*
 * 第 4 位是我们自己写进去的序号，每轮加 1，它变了不代表设备说了新东西，所以比帧的时候抹掉。
 */
export function frameKey(block: Buffer): string {
  return Array.from(block.subarray(0, REPORT_LENGTH), (byte, index) =>
    index === SEQ_OFFSET ? 0 : byte
  ).join(',')
}

let lastFrameKey = ''
let lastFrameAt: string | null = null

/*
 * 只在帧内容真的变了才推进时间戳。插拔之后设备自己也要 20~60 秒（实测 20 / 24 / 58 秒）
 * 才把新状态推上来，这期间每 30 秒读一次读到的都是同一帧缓存，要是照旧写"现在"，
 * 界面就一直显示"刚刚"，把一分钟前的状态演成即时的。
 */
function stampFrame(block: Buffer): string {
  const key = frameKey(block)
  if (key !== lastFrameKey || !lastFrameAt) lastFrameAt = new Date().toISOString()
  lastFrameKey = key
  return lastFrameAt
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
      if (parsed) return { ...parsed, at: stampFrame(report) }
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
    chargeLevel: null,
    model: null,
    note: '接收器没有响应电量查询',
    updatedAt: null
  }

  const path = commandChannel(group)
  if (!path) return { ...idle, note: '找不到电量通道' }

  const parsed = readInfoBlock(path)
  if (!parsed) return { ...idle, note: '没读到数据，鼠标可能在休眠' }

  if (parsed.charging) {
    // 正在充：percent 已经是 null，留空由 service 拿接入前那次真值补上、界面标灰；
    // 已充满（level=full）不一样，那时 100 是当场读到的，照实显示
    return {
      link: '2.4g',
      status: 'ok',
      percent: parsed.percent,
      charging: true,
      chargeLevel: parsed.level,
      model: parsed.model,
      note: parsed.percent === null ? '充电中，电量暂不更新' : null,
      updatedAt: parsed.at
    }
  }

  return {
    link: '2.4g',
    status: 'ok',
    percent: parsed.percent,
    charging: false,
    chargeLevel: null,
    model: parsed.model,
    note: null,
    updatedAt: parsed.at
  }
}
