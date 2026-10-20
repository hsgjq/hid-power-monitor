import { measureMchoseKeyboard, mergeWireless } from '../src/main/power/mchose'
import { groupHidDevices, listHidInterfaces } from '../src/main/hid/enumerate'

/*
 * mergeWireless 的断言：分片收不齐必须整份作废。之前它是"有几片拼几片"，
 * 半截载荷的第 2 字节会被当充电位读，凭空判成"充电中"，颜色就被充电状态色接管了。
 */

const REPORT_ID = 0x13
const COMMAND = 0x4a

function frame(total: number, current: number, body: number[]): number[] {
  const report = [REPORT_ID, COMMAND, total, current, 0, ...body]
  report.push(report.reduce((sum, byte) => sum + byte, 0) & 0xff)
  return report
}

const cases: Array<[string, number[][], string]> = [
  ['单片就是一份', [frame(1, 1, [66, 0x01])], '66%|未充电'],
  ['三片收齐', [frame(3, 1, [69]), frame(3, 2, [0x01]), frame(3, 3, [0x00])], '69%|未充电'],
  ['只有 2/3 片', [frame(3, 1, [69, 0x10]), frame(3, 2, [0x00])], 'null'],
  ['片数够但中间缺一片', [frame(3, 1, [69, 0x10]), frame(3, 3, [0x00]), frame(3, 3, [0x00])], 'null'],
  ['帧号从 0 开始也认', [frame(2, 0, [77, 0x10]), frame(2, 1, [0x00])], '77%|充电中'],
  ['空输入', [], 'null'],
  ['混进别的命令的帧', [frame(1, 1, [66, 0x01]), [REPORT_ID, 0x5b, 1, 1, 0, 9, 9]], '66%|未充电']
]

function describe(payload: number[] | null): string {
  if (!payload || payload.length < 2) return 'null'
  const percent = payload[0] >= 1 && payload[0] <= 100 ? payload[0] : null
  const charging = ((payload[1] >> 4) & 0x0f) !== 0
  return `${percent === null ? 'null' : percent + '%'}|${charging ? '充电中' : '未充电'}`
}

let failed = 0
for (const [label, reports, expect] of cases) {
  const got = describe(mergeWireless(reports))
  const ok = got === expect
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} -> ${got}   (期望 ${expect})`)
}

const group = groupHidDevices(listHidInterfaces()).find(
  (item) => item.vendorId === 0x05ac && item.productId === 0x024f
)
console.log('\n真机读取:', JSON.stringify(group ? measureMchoseKeyboard(group) : null))
if (failed) process.exitCode = 1
