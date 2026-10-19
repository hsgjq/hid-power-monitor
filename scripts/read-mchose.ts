import { HID, devices } from 'node-hid'

interface Target {
  path: string
  usagePage: number
  usage: number
  product: string | undefined
}

function findTargets(vendorId: number, productId: number): Target[] {
  return devices()
    .filter((d) => d.vendorId === vendorId && d.productId === productId)
    .filter((d) => d.usagePage === 0xff02 || d.usagePage === 0xff04)
    .map((d) => ({
      path: d.path ?? '',
      usagePage: d.usagePage ?? 0,
      usage: d.usage ?? 0,
      product: d.product
    }))
}

function checksum(bytes: number[]): number {
  return bytes.reduce((sum, b) => sum + b, 0) & 0xff
}

function hex(bytes: number[] | Uint8Array | null): string {
  if (!bytes) return 'null'
  return Buffer.from(bytes).toString('hex')
}

function probeWireless(path: string): void {
  console.log(`\n[wireless] ${path}`)
  let device: HID
  try {
    device = new HID(path)
  } catch (error) {
    console.log(`  open failed: ${error instanceof Error ? error.message : String(error)}`)
    return
  }

  try {
    const command = [0x13, 0x4a, 0x01]
    while (command.length < 19) command.push(0)
    command.push(checksum(command))
    console.log(`  write: ${hex(command)}`)
    device.write(command)

    const reports: number[][] = []
    const deadline = Date.now() + 2500
    while (Date.now() < deadline && reports.length < 8) {
      const report = device.readTimeout(400)
      if (report.length > 0) {
        reports.push(report)
        console.log(`  read: ${hex(report)}`)
      }
    }

    if (reports.length === 0) {
      console.log('  no input reports')
      return
    }

    const payloads: number[] = []
    for (const report of reports) {
      const data = report[0] === 0x13 ? report.slice(1) : report
      if (data.length < 6) continue
      const commandParams = data[0]
      const total = data[1]
      const current = data[2]
      const chunk = data.slice(4, -1)
      console.log(
        `  packet cmd=0x${commandParams.toString(16)} total=${total} current=${current} chunk=${hex(chunk)}`
      )
      if (commandParams === 0x4a) payloads.push(...chunk)
    }
    console.log(`  merged: ${hex(Uint8Array.from(payloads))}`)
    if (payloads.length >= 2) {
      const rawFlags = payloads[1]
      console.log(
        `  battery=${payloads[0]} flags=0x${rawFlags.toString(16)} high=${rawFlags >> 4} low=${rawFlags & 0x0f}`
      )
    }
  } finally {
    device.close()
  }
}

function probeWired(path: string): void {
  console.log(`\n[wired] ${path}`)
  let device: HID
  try {
    device = new HID(path)
  } catch (error) {
    console.log(`  open failed: ${error instanceof Error ? error.message : String(error)}`)
    return
  }

  try {
    const request = [0x87, 0x00, 0x00, 0x01, 0x00, 0x02, 0x00]
    device.sendFeatureReport([0x06, ...request])
    const response = device.getFeatureReport(6, 7)
    console.log(`  response: ${hex(response)}`)

    const data = response[0] === 0x06 ? response.slice(1) : response
    console.log(`  data: ${hex(data)}`)
    if (data.length >= 2) {
      const rawFlags = data[1]
      console.log(
        `  battery=${data[0]} flags=0x${rawFlags.toString(16)} high=${rawFlags >> 4} low=${rawFlags & 0x0f}`
      )
    }
  } catch (error) {
    console.log(`  failed: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    device.close()
  }
}

const targets = findTargets(0x05ac, 0x024f)
console.log(`targets: ${targets.length}`)
for (const target of targets) {
  console.log(`  ${target.product} page=0x${target.usagePage.toString(16)} usage=${target.usage}`)
}

for (const target of targets) {
  if (target.usagePage === 0xff02) probeWireless(target.path)
  if (target.usagePage === 0xff04) probeWired(target.path)
}
