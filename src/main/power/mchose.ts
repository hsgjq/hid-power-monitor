import { HID } from 'node-hid'
import type { DeviceMeasurement, HidDeviceGroup, HidInterfaceInfo } from '../../shared/types'

/*
 * 迈从键盘（接收器 05AC:024F，Compx 方案）的电量读取，两条端点：
 * - usage page 0xFF02：无线，20 字节 input/output，report ID 0x13。写查询后设备
 *   会分多帧回，帧头是 [cmd, 总帧数, 当前帧号]，去掉帧尾校验再拼起来才是完整数据。
 * - usage page 0xFF04：有线，feature-only，report ID 6、7 字节。
 * 校验和是"含 report ID 的字节和取低 8 位"，写出去的帧要带上它，否则设备不理。
 */

const WIRELESS_REPORT_ID = 0x13
const WIRELESS_COMMAND = 0x4a
const WIRED_REPORT_ID = 0x06

function checksum(bytes: number[]): number {
  return bytes.reduce((sum, byte) => sum + byte, 0) & 0xff
}

function endpoints(group: HidDeviceGroup): HidInterfaceInfo[] {
  return group.interfaces.filter(
    (item) => item.usagePage === 0xff02 || item.usagePage === 0xff04
  )
}

/*
 * 拼分片，并把"没收齐"直接判成读不到。半截载荷里第 2 个字节可能是别的数据，
 * 拿它当充电位就会凭空判成"充电中"——那一项的颜色会被充电状态色接管，不再吃用户设置的
 * 文字色，看起来像"颜色设置偶尔失灵"。宁可这一轮没有读数（界面沿用上一次真值并标灰），
 * 也不给出一个像是真的的错数。
 */
export function mergeWireless(reports: number[][]): number[] | null {
  const fragments = new Map<number, number[]>()
  let declared = 0

  for (const report of reports) {
    const data = report[0] === WIRELESS_REPORT_ID ? report.slice(1) : report
    if (data.length < 6 || data[0] !== WIRELESS_COMMAND) continue
    declared = data[1]
    fragments.set(data[2], data.slice(4, -1))
  }

  if (declared < 1 || fragments.size !== declared) return null

  // 帧号从几开始取决于设备，按最小号连续排；中间缺任何一片都算没读齐
  const first = Math.min(...fragments.keys())
  const payload: number[] = []
  for (let i = 0; i < declared; i += 1) {
    const part = fragments.get(first + i)
    if (!part) return null
    payload.push(...part)
  }
  return payload
}

function readWireless(path: string): number[] | null {
  const command = [WIRELESS_REPORT_ID, WIRELESS_COMMAND, 0x01]
  while (command.length < 19) command.push(0)
  command.push(checksum(command))

  let device: HID
  try {
    device = new HID(path)
  } catch {
    return null
  }

  try {
    device.write(command)
    const reports: number[][] = []
    // 收满分片就走：这些读是在主进程里同步跑的，写死等满 2 秒会让整个应用每 30 秒
    // 卡住一次（拖动浮条时尤其明显）。帧头 [cmd, 总片数, 当前片] 里带着总片数，
    // 所以齐了就能提前退出；设备不响应时最多也只等 900ms。
    const deadline = Date.now() + 900
    let expected = 0
    let received = 0
    while (Date.now() < deadline && (expected === 0 || received < expected)) {
      const report = device.readTimeout(120)
      if (report.length === 0) continue
      const data = report[0] === WIRELESS_REPORT_ID ? report.slice(1) : report
      if (data.length >= 3 && data[0] === WIRELESS_COMMAND) {
        expected = data[1]
        received += 1
      }
      reports.push(report)
    }
    const payload = mergeWireless(reports)
    return payload && payload.length >= 2 ? payload : null
  } catch {
    return null
  } finally {
    device.close()
  }
}

function readWired(path: string): number[] | null {
  let device: HID
  try {
    device = new HID(path)
  } catch {
    return null
  }

  try {
    device.sendFeatureReport([WIRED_REPORT_ID, 0x87, 0x00, 0x00, 0x01, 0x00, 0x02, 0x00])
    const report = device.getFeatureReport(WIRED_REPORT_ID, 7)
    const data = report[0] === WIRED_REPORT_ID ? report.slice(1) : report
    return data.length >= 2 ? Array.from(data) : null
  } catch {
    return null
  } finally {
    device.close()
  }
}

export function measureMchoseKeyboard(group: HidDeviceGroup): DeviceMeasurement {
  const list = endpoints(group)
  const wireless = list.find((item) => item.usagePage === 0xff02)
  const wired = list.find((item) => item.usagePage === 0xff04)

  // 有线那条用的是 sendFeatureReport（HidD_SetFeature 形态），属于写操作，所以只在
  // 这个接收器**没有**无线端点时才走它。之前拿它当"无线读空"的兜底，会把插在 2.4G 上
  // 的键盘在某一轮标成"有线"，也平白多了一次对设备的写入。
  const fromWireless = wireless ? readWireless(wireless.path) : null
  const fromWired = !wireless && wired ? readWired(wired.path) : null
  const payload = fromWireless ?? fromWired

  const percent = payload && payload[0] >= 1 && payload[0] <= 100 ? payload[0] : null
  // byte1 高 4 位是充电位：插线实测 flags=0x10（高 1 低 0），不充电时是 0x01（高 0 低 1）。
  // 之前按"高半字节=满电、低半字节=充电"拆过一版，方向是反的，别照那个改回去。
  // 与鼠标不同，键盘充电时照样上报真实电量，所以这里不需要把 percent 置空。
  const charging = payload ? ((payload[1] >> 4) & 0x0f) !== 0 : null

  return {
    link: fromWireless ? '2.4g' : fromWired ? 'wired' : 'unknown',
    status: percent !== null ? 'ok' : 'error',
    percent,
    charging,
    model: null,
    note: percent !== null ? null : '接收器没有响应电量查询',
    updatedAt: percent !== null ? new Date().toISOString() : null
  }
}
