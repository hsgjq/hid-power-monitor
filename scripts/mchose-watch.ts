import { HID, devices } from 'node-hid'

/*
 * 键盘（05AC:024F）充电观测。只发 0x4A 这一条读命令——它是设备正常的电量查询，
 * 厂商驱动也在反复发；不做任何写配置的动作。
 *
 * 用法：npx tsx scripts/mchose-watch.ts [时长秒] [间隔秒]
 */

const VID = 0x05ac
const PID = 0x024f
const REPORT_ID = 0x13
const COMMAND = 0x4a

const durationMs = Number(process.argv[2] ?? 900) * 1000
const gapMs = Number(process.argv[3] ?? 15) * 1000

function checksum(bytes: number[]): number {
  return bytes.reduce((sum, byte) => sum + byte, 0) & 0xff
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function findPath(wired: boolean): string | undefined {
  const page = wired ? 0xff04 : 0xff02
  return devices().find((d) => d.vendorId === VID && d.productId === PID && d.usagePage === page)?.path
}

function sampleWireless(): string {
  const path = findPath(false)
  if (!path) return 'no 0xFF02 endpoint'

  const command = [REPORT_ID, COMMAND, 0x01]
  while (command.length < 19) command.push(0)
  command.push(checksum(command))

  let device: HID
  try {
    device = new HID(path)
  } catch (error) {
    return `open 失败: ${(error instanceof Error ? error.message : '').slice(0, 40)}`
  }

  try {
    device.write(command)
    const merged: number[] = []
    const deadline = Date.now() + 2500
    while (Date.now() < deadline && merged.length < 32) {
      const report = device.readTimeout(200)
      if (report.length === 0) continue
      const data = report[0] === REPORT_ID ? report.slice(1) : report
      if (data.length < 6 || data[0] !== COMMAND) continue
      merged.push(...data.slice(4, -1))
    }
    if (merged.length < 2) return '没有响应帧'

    const percent = merged[0]
    const flags = merged[1]
    return `percent=${percent} flags=0x${flags.toString(16).padStart(2, '0')} 高4位=${flags >> 4} 低4位=${flags & 0x0f} 帧=${Buffer.from(merged).toString('hex')}`
  } catch (error) {
    return `读写失败: ${(error instanceof Error ? error.message : '').slice(0, 60)}`
  } finally {
    device.close()
  }
}

function sampleWired(): string {
  const path = findPath(true)
  if (!path) return 'no 0xFF04 endpoint'
  let device: HID
  try {
    device = new HID(path)
  } catch (error) {
    return `open 失败: ${(error instanceof Error ? error.message : '').slice(0, 40)}`
  }
  try {
    device.sendFeatureReport([0x06, 0x87, 0x00, 0x00, 0x01, 0x00, 0x02, 0x00])
    const report = Buffer.from(device.getFeatureReport(6, 7))
    return `有线 feature: ${report.toString('hex')}`
  } catch (error) {
    return `有线读取失败: ${(error instanceof Error ? error.message : '').slice(0, 60)}`
  } finally {
    device.close()
  }
}

const stamp = (): string => new Date().toISOString().slice(11, 19)

async function main(): Promise<void> {
  const started = Date.now()
  let round = 0
  while (Date.now() - started < durationMs) {
    round += 1
    console.log(`[${stamp()}] 无线 ${sampleWireless()}`)
    console.log(`[${stamp()}] ${sampleWired()}`)
    if (Date.now() - started + gapMs > durationMs) break
    await delay(gapMs)
  }
  console.log(`[${stamp()}] 结束，共 ${round} 轮`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
