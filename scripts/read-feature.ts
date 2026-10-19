import { HID, devices } from 'node-hid'

const [vidHex, pidHex, usagePageHex, usageHex, reportIdStr, lengthStr, samplesStr] =
  process.argv.slice(2)

if (!vidHex || !pidHex || !usagePageHex || !usageHex || !reportIdStr) {
  console.error(
    'usage: tsx scripts/read-feature.ts <vid> <pid> <usagePage> <usage> <reportId> [length] [samples]'
  )
  process.exit(1)
}

const vid = Number.parseInt(vidHex, 16)
const pid = Number.parseInt(pidHex, 16)
const usagePage = Number.parseInt(usagePageHex, 16)
const usage = Number.parseInt(usageHex, 16)
const reportId = Number(reportIdStr)
const length = lengthStr ? Number(lengthStr) : 64
const samples = samplesStr ? Number(samplesStr) : 1

const matches = devices().filter(
  (device) =>
    device.vendorId === vid &&
    device.productId === pid &&
    device.usagePage === usagePage &&
    (usage === 0 || device.usage === usage)
)

if (matches.length === 0) {
  console.error('no matching interface')
  process.exit(1)
}

const path = matches[0].path
if (!path) {
  console.error('matching interface has no path')
  process.exit(1)
}

console.log(`path=${path}`)
const device = new HID(path)

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main(): Promise<void> {
  for (let i = 0; i < samples; i += 1) {
    try {
      const data = device.getFeatureReport(reportId, length)
      const buffer = Buffer.from(data)
      console.log(
        `sample ${i + 1}: len=${buffer.length} hex=${buffer.toString('hex')} dec=[${Array.from(buffer).join(',')}]`
      )
    } catch (error) {
      console.error(`sample ${i + 1}: ${error instanceof Error ? error.message : String(error)}`)
    }

    if (i + 1 < samples) await delay(1000)
  }
}

main().finally(() => device.close())
