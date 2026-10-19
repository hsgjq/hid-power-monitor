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

function mergeWireless(reports: number[][]): number[] {
  const payload: number[] = []
  for (const report of reports) {
    const data = report[0] === WIRELESS_REPORT_ID ? report.slice(1) : report
    if (data.length < 6 || data[0] !== WIRELESS_COMMAND) continue
    payload.push(...data.slice(4, -1))
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
    const deadline = Date.now() + 2000
    while (Date.now() < deadline && reports.length < 8) {
      const report = device.readTimeout(200)
      if (report.length > 0) reports.push(report)
    }
    const payload = mergeWireless(reports)
    return payload.length >= 2 ? payload : null
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

  const payload =
    (wireless ? readWireless(wireless.path) : null) ?? (wired ? readWired(wired.path) : null)

  const percent = payload && payload[0] >= 1 && payload[0] <= 100 ? payload[0] : null
  // byte1 高 4 位是充电位：插线实测 flags=0x10（高 1 低 0），不充电时是 0x01（高 0 低 1）。
  // 之前按"高半字节=满电、低半字节=充电"拆过一版，方向是反的，别照那个改回去。
  // 与鼠标不同，键盘充电时照样上报真实电量，所以这里不需要把 percent 置空。
  const charging = payload ? ((payload[1] >> 4) & 0x0f) !== 0 : null

  return {
    link: wireless && percent !== null ? '2.4g' : wired ? 'wired' : 'unknown',
    status: percent !== null ? 'ok' : 'error',
    percent,
    charging,
    model: null,
    note: percent !== null ? null : '接收器没有响应电量查询',
    updatedAt: percent !== null ? new Date().toISOString() : null
  }
}
