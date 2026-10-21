import { HID } from 'node-hid'
import type { CompxProbeResult, FeatureProbeResult } from '../../shared/types'

const COMPX_REPORT_ID = 0x08
const COMPX_PAYLOAD_LENGTH = 16

function checksum(payload: Uint8Array): number {
  let sum = 0
  for (let i = 0; i < COMPX_PAYLOAD_LENGTH - 1; i += 1) {
    sum += payload[i]
  }
  return (85 - (sum & 0xff)) & 0xff
}

function buildReport(command: number, extra?: Uint8Array): number[] {
  const payload = new Uint8Array(COMPX_PAYLOAD_LENGTH)
  payload[0] = command

  if (extra?.length) {
    payload[4] = extra.length
    for (let i = 0; i < extra.length && 5 + i < COMPX_PAYLOAD_LENGTH - 1; i += 1) {
      payload[5 + i] = extra[i]
    }
  }

  payload[COMPX_PAYLOAD_LENGTH - 1] = (checksum(payload) - 8) & 0xff
  return [COMPX_REPORT_ID, ...payload]
}

/*
 * 写命令之前先把队列里剩下的输入报告倒掉。readTimeout 超时给的是空数组、不抛异常
 * （node-hid 的 hid_read_timeout 返回 0 而不是 -1），所以读到空就该停：原来那个
 * try/catch 里的 break 永远进不去，每次固定把 8×10ms 等满。
 */
function drain(device: HID): void {
  for (let i = 0; i < 8; i += 1) {
    if (device.readTimeout(10).length === 0) return
  }
}

function sendAndReceive(
  device: HID,
  report: number[],
  timeoutMs: number
): number[] | null {
  drain(device)
  try {
    device.write(report)
    return device.readTimeout(timeoutMs)
  } catch {
    return null
  }
}

function hex(data: number[] | null): string | null {
  if (!data || data.length === 0) return null
  return Buffer.from(data).toString('hex')
}

export function probeCompx(path: string): CompxProbeResult {
  const responses: string[] = []
  let device: HID

  try {
    device = new HID(path)
  } catch (error) {
    return {
      outcome: 'error',
      cid: null,
      mid: null,
      online: null,
      batteryPercent: null,
      charging: null,
      responses,
      error: error instanceof Error ? error.message : String(error)
    }
  }

  try {
    const random = new Uint8Array(8)
    for (let i = 0; i < 4; i += 1) {
      random[i] = Math.floor(Math.random() * 256)
    }

    const handshake = sendAndReceive(device, buildReport(1, random), 400)
    responses.push(`cmd1=${hex(handshake) ?? 'null'}`)

    const cid = handshake && handshake.length > 10 ? handshake[10] : null
    const mid = handshake && handshake.length > 11 ? handshake[11] : null

    const driverStatus = sendAndReceive(device, buildReport(2, new Uint8Array([1])), 250)
    responses.push(`cmd2=${hex(driverStatus) ?? 'null'}`)

    const onlineResponse = sendAndReceive(device, buildReport(3), 400)
    responses.push(`cmd3=${hex(onlineResponse) ?? 'null'}`)
    const online =
      onlineResponse !== null && onlineResponse.length > 6 && onlineResponse[6] > 0

    let batteryPercent: number | null = null
    let charging: boolean | null = null

    if (online) {
      const batteryResponse = sendAndReceive(device, buildReport(4), 500)
      responses.push(`cmd4=${hex(batteryResponse) ?? 'null'}`)
      if (batteryResponse && batteryResponse.length > 8) {
        const value = batteryResponse[6]
        if (value <= 100) {
          batteryPercent = value
          charging = batteryResponse[7] === 1
        }
      }
    }

    return {
      outcome: handshake || onlineResponse ? 'answered' : 'no-response',
      cid,
      mid,
      online,
      batteryPercent,
      charging,
      responses
    }
  } catch (error) {
    return {
      outcome: 'error',
      cid: null,
      mid: null,
      online: null,
      batteryPercent: null,
      charging: null,
      responses,
      error: error instanceof Error ? error.message : String(error)
    }
  } finally {
    device.close()
  }
}

export function probeFeatureReports(path: string, maxReportId = 8): FeatureProbeResult[] {
  const results: FeatureProbeResult[] = []
  let device: HID

  try {
    device = new HID(path)
  } catch (error) {
    return [
      {
        reportId: -1,
        hex: null,
        error: error instanceof Error ? error.message : String(error)
      }
    ]
  }

  try {
    for (let reportId = 0; reportId <= maxReportId; reportId += 1) {
      try {
        const data = device.getFeatureReport(reportId, 64)
        results.push({
          reportId,
          hex: Buffer.from(data).toString('hex')
        })
      } catch (error) {
        results.push({
          reportId,
          hex: null,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }
  } finally {
    device.close()
  }

  return results
}
