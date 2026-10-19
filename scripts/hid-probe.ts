import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { probeCompx, probeFeatureReports } from '../src/main/hid/compx'
import type {
  FeatureProbeResult,
  HidDeviceGroup,
  HidInterfaceInfo,
  HidInterfaceProbe,
  ProbeReport
} from '../src/shared/types'
import { scanHidDevices, toHex } from '../src/main/hid/enumerate'

const args = new Set(process.argv.slice(2))
const jsonOnly = args.has('--json')
// CompX 探针是真的往设备发帧（cmd 1 还带 4 字节随机数，像握手/配对），所以默认不发，
// 要发必须显式加 --compx。其余动作只有 getFeatureReport，属于读取。
const runCompx = args.has('--compx')
const skipFeatures = args.has('--skip-features')

function describeKind(usagePage: number | null, usage: number | null, kind: string): string {
  const page = usagePage === null ? '----' : `0x${toHex(usagePage)}`
  const usageText = usage === null ? '----' : `0x${toHex(usage)}`
  return `${page}/${usageText} ${kind}`
}

function isCompxEndpoint(item: HidInterfaceInfo): boolean {
  return item.usagePage === 0xff02 && item.usage === 0x0002
}

function nonZeroBytes(feature: FeatureProbeResult): boolean {
  if (!feature.hex) return false
  return /[1-9a-f]/i.test(feature.hex)
}

function formatGroup(group: HidDeviceGroup): string {
  const name = group.product ?? '(unknown product)'
  const manufacturer = group.manufacturer ? ` / ${group.manufacturer}` : ''
  const flags = [
    group.isWirelessReceiverCandidate ? '2.4G candidate' : '',
    group.hasKeyboard ? 'keyboard' : '',
    group.hasMouse ? 'mouse' : '',
    group.hasVendorInterface ? 'vendor' : ''
  ]
    .filter(Boolean)
    .join(', ')

  const lines = [
    `[${group.vendorIdHex}:${group.productIdHex}] ${name}${manufacturer}`,
    `  ${flags || 'no flags'}`
  ]

  for (const item of group.interfaces) {
    lines.push(
      `  iface ${item.interface ?? '?'}  ${describeKind(
        item.usagePage,
        item.usage,
        item.kind
      )}  ${item.path}`
    )
  }

  return lines.join('\n')
}

function probeCandidate(group: HidDeviceGroup): HidInterfaceProbe[] {
  const probes: HidInterfaceProbe[] = []

  for (const item of group.interfaces) {
    if (!item.isVendorDefined) continue

    const probe: HidInterfaceProbe = {
      label: `${group.vendorIdHex}:${group.productIdHex} iface ${item.interface ?? '?'} ${describeKind(
        item.usagePage,
        item.usage,
        item.kind
      )}`,
      path: item.path,
      usagePageHex: `0x${toHex(item.usagePage ?? 0)}`,
      usageHex: `0x${toHex(item.usage ?? 0)}`
    }

    if (runCompx && isCompxEndpoint(item)) {
      probe.compx = probeCompx(item.path)
    }

    if (!skipFeatures && !isCompxEndpoint(item)) {
      probe.features = probeFeatureReports(item.path)
    }

    probes.push(probe)
  }

  return probes
}

function printCompX(probe: HidInterfaceProbe): void {
  if (!probe.compx) return
  const result = probe.compx
  console.log(`  CompX ${probe.label}`)
  for (const line of result.responses) console.log(`    ${line}`)
  console.log(
    `    outcome=${result.outcome} online=${String(result.online)} cid=${String(
      result.cid
    )} mid=${String(result.mid)} battery=${String(result.batteryPercent)} charging=${String(
      result.charging
    )}`
  )
  if (result.error) console.log(`    error=${result.error}`)
}

function printFeatures(probe: HidInterfaceProbe): void {
  if (!probe.features) return
  console.log(`  Feature reports ${probe.label}`)
  for (const feature of probe.features) {
    if (feature.error) {
      if (feature.reportId === 0) {
        console.log(`    id=${feature.reportId} error=${feature.error}`)
      }
      continue
    }
    if (feature.reportId === -1) {
      console.log(`    open error=${feature.error}`)
      continue
    }
    if (nonZeroBytes(feature) || feature.reportId === 0) {
      console.log(`    id=${feature.reportId} ${feature.hex}`)
    }
  }
}

function main(): void {
  const scan = scanHidDevices()
  const candidates = scan.groups.filter((group) => group.isWirelessReceiverCandidate)
  const report: ProbeReport = { scan, candidates: [] }

  if (!jsonOnly) {
    console.log(
      `HID interfaces: ${scan.interfaces.length}, device groups: ${scan.groups.length}, wireless receiver candidates: ${candidates.length}`
    )
    // 把这行打在结果里，好让"到底发没发帧"这件事被输出证明，而不是靠读代码猜
    console.log(
      `CompX write probe: ${runCompx ? 'ENABLED (frames were sent)' : 'disabled (read-only; pass --compx to send)'}`
    )
    console.log('')

    for (const group of scan.groups) {
      console.log(formatGroup(group))
      console.log('')
    }
  }

  for (const group of candidates) {
    const probes = probeCandidate(group)
    report.candidates.push({ group, probes })

    if (!jsonOnly) {
      console.log(`Probing ${group.vendorIdHex}:${group.productIdHex} ...`)
      for (const probe of probes) {
        printCompX(probe)
        printFeatures(probe)
      }
      console.log('')
    }
  }

  const outputDir = resolve(process.cwd(), 'probe-results')
  mkdirSync(outputDir, { recursive: true })
  const outputPath = resolve(outputDir, 'latest.json')
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  if (jsonOnly) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    console.log(`Probe report written to ${outputPath}`)
  }
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
}
