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

const overPercent = Buffer.from(real)
overPercent[18] = 200

// 型号串只认数字和大写字母：这帧把 M137 换成 m137，其余字节与真实帧全同
const lowercaseModel = Buffer.from(
  '0c012000a00110006d3133372801002510ff3800ff01000048182038ffc767096d',
  'hex'
)

// 充电中：设备把电量字节钉成 100、idx19 置 1，其余不动
const charging = Buffer.from(real)
charging[18] = 100
charging[19] = 1

// 真充满：idx19 不再是 1，100 就该照实显示
const fullUnplugged = Buffer.from(real)
fullUnplugged[18] = 100

const cases: Array<[string, Buffer, string]> = [
  ['真实帧', real, '56%|未充电'],
  ['自己写回去的空帧', echo, 'null'],
  ['百分比为 0 的帧（真见底）', zeroPercent, '0%|未充电'],
  ['百分比字节超范围（200）', overPercent, 'null'],
  ['型号串是小写字母', lowercaseModel, 'null'],
  ['充电中帧（100 是占位）', charging, 'null|充电中'],
  ['拔线后 100 帧', fullUnplugged, '100%|未充电']
]

function describe(block: Buffer): string {
  const parsed = parseInfoBlock(block)
  if (!parsed) return 'null'
  return `${parsed.percent === null ? 'null' : parsed.percent + '%'}|${parsed.charging ? '充电中' : '未充电'}`
}

let failed = 0
for (const [label, block, expect] of cases) {
  const got = describe(block)
  const ok = got === expect
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} -> ${got}   (期望 ${expect})`)
}

const group = groupHidDevices(listHidInterfaces()).find(
  (item) => item.vendorId === 0x248a && item.productId === 0x5b2f
)
console.log('\n真机读取:', JSON.stringify(group ? measureAulaMouse(group) : null))
if (failed) process.exitCode = 1
