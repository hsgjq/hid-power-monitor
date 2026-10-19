import { HID, devices } from 'node-hid'
import { groupHidDevices, listHidInterfaces } from '../src/main/hid/enumerate'
import { measureAulaMouse } from '../src/main/power/aula'

function commandPath(): string {
  const found = devices().find(
    (d) => d.vendorId === 0x248a && d.productId === 0x5b2f && (d.path ?? '').includes('Col04')
  )
  if (!found?.path) throw new Error('Col04 not found')
  return found.path
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main(): Promise<void> {
  const path = commandPath()
  const device = new HID(path)
  for (let round = 0; round < 4; round++) {
    const frame = new Array(33).fill(0)
    frame[0] = 12
    frame[1] = 0x01
    frame[2] = 0x20
    frame[4] = 0xa0 + round
    frame[5] = 0x01
    device.sendFeatureReport(frame)
    await delay(120)
    const raw = Buffer.from(device.getFeatureReport(12, 33))
    console.log(`seq=0x${frame[4].toString(16)} raw=${raw.toString('hex')}`)
    console.log(
      `   idx15=${raw[15]} idx16=${raw[16]} idx18=${raw[18]} idx24=${raw[24]} idx27=${raw[27]}`
    )
    await delay(900)
  }
  device.close()

  const group = groupHidDevices(listHidInterfaces()).find(
    (item) => item.vendorId === 0x248a && item.productId === 0x5b2f
  )
  console.log('\nprovider reading:', JSON.stringify(group ? measureAulaMouse(group) : null))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
