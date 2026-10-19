import { measureAulaMouse, parseInfoBlock } from '../src/main/power/aula'
import { groupHidDevices, listHidInterfaces } from '../src/main/hid/enumerate'

const real = Buffer.from(
  '0c012000a00110004d3133372801002510ff3800ff01000048182038ffc767096d',
  'hex'
)
const echo = Buffer.alloc(33)
echo[0] = 12
echo[1] = 1
echo[2] = 0x20
echo[4] = 0x55
echo[5] = 1

const zeroPercent = Buffer.from(real)
zeroPercent[18] = 0

const charging = Buffer.from(real)
charging[18] = 100
charging[19] = 1

const cases: Array<[string, Buffer, string]> = [
  ['真实帧', real, '56%'],
  ['自己写回去的空帧', echo, 'null'],
  ['百分比为 0 的帧', zeroPercent, 'null'],
  ['充电中帧', charging, '100% + charging']
]

let failed = 0
for (const [label, block, expect] of cases) {
  const parsed = parseInfoBlock(block)
  const got = parsed ? `${parsed.percent}% ${parsed.charging ? '充电中' : ''} ${parsed.model}`.trim() : 'null'
  const ok = expect === 'null' ? parsed === null : got.startsWith(expect.split(' ')[0])
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} -> ${got}   (期望 ${expect})`)
}

const group = groupHidDevices(listHidInterfaces()).find(
  (item) => item.vendorId === 0x248a && item.productId === 0x5b2f
)
console.log('\n真机读取:', JSON.stringify(group ? measureAulaMouse(group) : null))
if (failed) process.exitCode = 1
