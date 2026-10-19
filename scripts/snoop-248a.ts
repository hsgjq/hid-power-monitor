import { HID, devices } from 'node-hid'

const VID = 0x248a
const PID = 0x5b2f
const WINDOW_MS = Number(process.argv[2] ?? 90000)

interface Target {
  label: string
  path: string
  feature: { id: number; length: number } | null
}

const targets: Target[] = devices()
  .filter((d) => d.vendorId === VID && d.productId === PID && d.path)
  .map((d) => {
    const path = d.path as string
    const match = /Col(\d\d)|MI_(\d\d)/.exec(path)
    const tag = match ? (match[1] ? 'Col' + Number(match[1]) : 'MI' + Number(match[2])) : 'x'
    const page = d.usagePage ?? -1
    let feature: Target['feature'] = null
    if (page === 0xff00 && path.includes('Col04')) feature = { id: 12, length: 33 }
    if (page === 0xff00 && path.includes('Col05')) feature = { id: 7, length: 8 }
    if (page === 0xffef) feature = { id: 5, length: 64 }
    return { label: `${tag}-page${page.toString(16)}`, path, feature }
  })

const started = Date.now()
const iso = () => new Date().toISOString().slice(11, 23)

function openAll(): Array<{ target: Target; device: HID } | { target: Target; error: string }> {
  return targets.map((target) => {
    try {
      return { target, device: new HID(target.path) }
    } catch (error) {
      return { target, error: error instanceof Error ? error.message : String(error) }
    }
  })
}

async function main(): Promise<void> {
  console.log(`[${iso()}] window=${WINDOW_MS}ms targets=${targets.length}`)
  const opened = openAll()
  const live: Array<{ target: Target; device: HID }> = []
  for (const item of opened) {
    if ('error' in item) {
      console.log(`[${iso()}] OPEN-FAIL ${item.target.label} :: ${item.error}`)
    } else {
      live.push(item)
      console.log(`[${iso()}] open-ok  ${item.target.label}`)
    }
  }

  let lastFeature = new Map<string, string>()
  let reportCount = 0

  while (Date.now() - started < WINDOW_MS) {
    let touched = false
    for (const { target, device } of live) {
      try {
        const report = device.readTimeout(20)
        if (report.length > 0) {
          touched = true
          reportCount += 1
          console.log(`[${iso()}] INPUT ${target.label} ${Buffer.from(report).toString('hex')}`)
        }
      } catch (error) {
        console.log(`[${iso()}] read-err ${target.label} ${error instanceof Error ? error.message : ''}`)
      }

      if (!target.feature) continue
      try {
        const data = Buffer.from(device.getFeatureReport(target.feature.id, target.feature.length))
        const hex = data.toString('hex')
        if (lastFeature.get(target.label) !== hex && /[1-9a-f][1-9a-f]/.test(hex.slice(2))) {
          lastFeature.set(target.label, hex)
          console.log(`[${iso()}] FEATURE ${target.label} id=${target.feature.id} ${hex}`)
        }
      } catch {
        // feature reads fail on some collections; not interesting per-iteration
      }
    }
    if (!touched) await new Promise((resolve) => setTimeout(resolve, 10))
  }

  for (const { device } of live) {
    try {
      device.close()
    } catch {}
  }
  console.log(`[${iso()}] done inputReports=${reportCount}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
