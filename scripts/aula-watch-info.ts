import { HID, devices } from 'node-hid'
import { setTimeout as sleep } from 'node:timers/promises'

const REPORT_ID = 12
const LENGTH = 33
const DURATION_MS = Number(process.argv[2] ?? 360000)
const GAP_MS = 3000

function commandPath(): string {
  const found = devices().find(
    (d) => d.vendorId === 0x248a && d.productId === 0x5b2f && (d.path ?? '').includes('Col04')
  )
  if (!found?.path) throw new Error('Col04 not found')
  return found.path
}

const stamp = (): string => new Date().toISOString().slice(11, 23)

async function main(): Promise<void> {
  const device = new HID(commandPath())
  const deadline = Date.now() + DURATION_MS
  let previous: Buffer | null = null
  let seq = 0

  console.log(`只读观察器启动，窗口 ${Math.round(DURATION_MS / 1000)} 秒，每 ${GAP_MS}ms 采一次 0x20`)
  while (Date.now() < deadline) {
    const frame = new Array(LENGTH).fill(0)
    frame[0] = REPORT_ID
    frame[1] = 0x01
    frame[2] = 0x20
    frame[4] = (seq = (seq + 1) & 0xff)
    frame[5] = 0x01
    try {
      device.sendFeatureReport(frame)
      await sleep(100)
      const raw = Buffer.from(device.getFeatureReport(REPORT_ID, LENGTH))
      if (previous && raw.length === previous.length) {
        const diffs: string[] = []
        for (let i = 0; i < raw.length; i++) {
          if (i === 4) continue
          if (raw[i] !== previous[i]) diffs.push(`idx${i}: 0x${previous[i].toString(16)} -> 0x${raw[i].toString(16)}`)
        }
        if (diffs.length) console.log(`[${stamp()}] 变化 ${diffs.join('  ')}  全帧=${raw.toString('hex')}`)
      } else if (!previous) {
        console.log(`[${stamp()}] 基线 ${raw.toString('hex')}`)
      }
      previous = raw
    } catch (error) {
      console.log(`[${stamp()}] 读失败 ${(error instanceof Error ? error.message : '').slice(0, 50)}`)
    }
    await sleep(GAP_MS)
  }

  device.close()
  console.log(`[${stamp()}] 结束`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
