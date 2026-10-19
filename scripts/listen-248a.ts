import { HID, devices } from 'node-hid'

const VID = 0x248a
const PID = 0x5b2f
const DURATION_MS = 15000

const targets = devices().filter(
  (d) =>
    d.vendorId === VID &&
    d.productId === PID &&
    ((d.path ?? '').includes('MI_02') || (d.path ?? '').includes('Col06'))
)

async function main(): Promise<void> {
  console.log('targets=' + targets.length)
  const handles: HID[] = []
  for (const target of targets) {
    console.log('open ' + target.path)
    try {
      const device = new HID(target.path!)
      handles.push(device)
    } catch (error) {
      console.log('  open err: ' + (error instanceof Error ? error.message : String(error)))
    }
  }

  const deadline = Date.now() + DURATION_MS
  while (Date.now() < deadline) {
    let got = false
    for (const device of handles) {
      try {
        const report = device.readTimeout(200)
        if (report.length > 0) {
          got = true
          console.log(new Date().toISOString() + ' ' + Buffer.from(report).toString('hex'))
        }
      } catch (error) {
        console.log('read err: ' + (error instanceof Error ? error.message : String(error)))
      }
    }
    if (!got) await new Promise((resolve) => setTimeout(resolve, 20))
  }

  for (const device of handles) device.close()
  console.log('done')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
