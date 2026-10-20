import { frameKey, measureAulaMouse, parseInfoBlock } from '../src/main/power/aula'
import { groupHidDevices, listHidInterfaces } from '../src/main/hid/enumerate'

/*
 * 狼蛛那帧的判据断言。这些帧不是编的：短的是厂商驱动时期抓的 56% 那帧，
 * 后面三帧是 19:40 连着做三次插拔当场采的（已充满 / 正在充 / 拔掉），
 * 每条都直接来自设备，改动判据时这几条必须还成立。
 */

const discharging56 = Buffer.from(
  '0c012000a00110004d3133372801002510ff3800ff01000048182038ffc767096d',
  'hex'
)
const fullPlugged = Buffer.from(
  '0c012000010110004d3133372801002510ff6402ff00000048182038ffc767096d',
  'hex'
)
const chargingActive = Buffer.from(
  '0c012000240110004d3133372801002510ff6401ff01000048182038ffc767096d',
  'hex'
)
const unpluggedFull = Buffer.from(
  '0c012000100110004d3133372801002510ff6400ff01000048182038ffc767096d',
  'hex'
)

const echo = Buffer.alloc(33)
echo[0] = 12
echo[1] = 1
echo[2] = 0x20
echo[4] = 0x55
echo[5] = 1

// 空帧上改出来的几种坏情况
const zeroPercent = Buffer.from(unpluggedFull)
zeroPercent[18] = 0

const overPercent = Buffer.from(unpluggedFull)
overPercent[18] = 200

const lowercaseModel = Buffer.from(
  '0c012000010110006d3133372801002510ff6402ff00000048182038ffc767096d',
  'hex'
)

// 没见过的充电位：不能猜它是"充满"，数字得收回去
const unknownCharge = Buffer.from(unpluggedFull)
unknownCharge[19] = 3

const cases: Array<[string, Buffer, string]> = [
  ['真实帧 56%、没插电', discharging56, '56%|未插电'],
  ['插着且已充满（idx19=2）', fullPlugged, '100%|已充满'],
  ['正在充（idx19=1，电量位钉 100）', chargingActive, 'null|充电中'],
  ['拔掉之后仍报 100（那是真值）', unpluggedFull, '100%|未插电'],
  ['看不懂的充电位 3', unknownCharge, 'null|充电中'],
  ['自己写回去的空帧', echo, 'null'],
  ['百分比为 0（真见底）', zeroPercent, '0%|未插电'],
  ['百分比字节超范围 200', overPercent, 'null'],
  ['型号串是小写字母', lowercaseModel, 'null']
]

function describe(block: Buffer): string {
  const parsed = parseInfoBlock(block)
  if (!parsed) return 'null'
  const value = parsed.percent === null ? 'null' : `${parsed.percent}%`
  const state = parsed.charging ? (parsed.level === 'full' ? '已充满' : '充电中') : '未插电'
  return `${value}|${state}`
}

let failed = 0
for (const [label, block, expect] of cases) {
  const got = describe(block)
  const ok = got === expect
  if (!ok) failed += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} -> ${got}   (期望 ${expect})`)
}

// 帧比较只该忽略我们自己写的序号位
const sameFrameOtherSeq = Buffer.from(fullPlugged)
sameFrameOtherSeq[4] = 0x7e
const seqOnly = frameKey(fullPlugged) === frameKey(sameFrameOtherSeq)
console.log(`${seqOnly ? 'PASS' : 'FAIL'}  只有序号位不同 -> 认定是同一帧（不推进时间戳）`)
if (!seqOnly) failed += 1

const stateChanged = frameKey(fullPlugged) !== frameKey(chargingActive)
console.log(`${stateChanged ? 'PASS' : 'FAIL'}  充电位变了 -> 认定是新帧（该推进时间戳）`)
if (!stateChanged) failed += 1

const group = groupHidDevices(listHidInterfaces()).find(
  (item) => item.vendorId === 0x248a && item.productId === 0x5b2f
)
console.log('\n真机读取:', JSON.stringify(group ? measureAulaMouse(group) : null))
if (failed) process.exitCode = 1
