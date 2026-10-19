import type { HidDiagnostics, HidDiagnosticsGroup } from '../../shared/types'
import { classifyGroup, dispositionLabel, identify } from '../power/registry'
import { groupHidDevices, listHidInterfaces, toHex } from './enumerate'

/*
 * 诊断清单：把枚举到的每一组 HID 设备、它有哪些集合、面板为什么显示/不显示它列出来。
 * 判定口径直接复用 registry 的 classifyGroup，两处不会各说各话。
 * 用途是"以后要支持新设备时，把这几行复制出去就能定位到协议入口"。
 */

function hex(value: number | null): string {
  return value === null ? '-' : `0x${toHex(value, 4)}`
}

export function buildDiagnostics(): HidDiagnostics {
  const groups: HidDiagnosticsGroup[] = groupHidDevices(listHidInterfaces()).map((group) => {
    const disposition = classifyGroup(group)

    return {
      id: identify(group),
      manufacturer: group.manufacturer,
      product: group.product,
      interfaceCount: group.interfaces.length,
      shown: disposition.mode !== 'hidden',
      reason: dispositionLabel(disposition),
      collections: group.interfaces.map((item) => ({
        usagePage: hex(item.usagePage),
        usage: hex(item.usage),
        kind: item.kind
      }))
    }
  })

  return {
    generatedAt: new Date().toISOString(),
    groups: groups.sort((a, b) => {
      if (a.shown !== b.shown) return a.shown ? -1 : 1
      return a.id.localeCompare(b.id)
    })
  }
}
