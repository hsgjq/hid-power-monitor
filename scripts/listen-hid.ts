import { HID, devices } from 'node-hid'

const [vidHex, pidHex, usagePageHex, usageHex, secondsStr] = process.argv.slice(2)

if (!vidHex || !pidHex || !usagePageHex || !usageHex) {
  console.error('usage: tsx scripts/listen-hid.ts <vid> <pid> <usagePage> <usage> [seconds]')
  process.exit(1)
}

const vid = Number.parseInt(vidHex, 16)
const pid = Number.parseInt(pidHex, 16)
const usagePage = Number.parseInt(usagePageHex, 16)
const usage = usageHex === 'null' ? null : Number.parseInt(usageHex, 16)
const seconds = secondsStr ? Number(secondsStr) : 8

const match = devices().find(
  (device) =>
    device.vendorId === vid &&
    device.productId === pid &&
    device.usagePage === usagePage &&
    (usage === null ? device.usage === undefined : device.usage === usage)
)

if (!match?.path) {
  console.error('no matching interface')
  process.exit(1)
}

console.log(`path=${match.path}`)
const device = new HID(match.path)
const deadline = Date.now() + seconds * 1000
let count = 0

try {
  while (Date.now() < deadline) {
    try {
      const data = device.readTimeout(1000)
      count += 1
      console.log(`report ${count}: len=${data.length} hex=${Buffer.from(data).toString('hex')}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!message.includes('timeout') && !message.includes('Timeout')) {
        console.log(`read stopped: ${message}`)
        break
      }
    }
  }
} finally {
  device.close()
}

console.log(`done, ${count} report(s)`)
