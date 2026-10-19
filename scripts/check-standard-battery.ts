import { pickBatteryValue, type FeatureRead } from '../src/main/power/standard-battery'

/*
 * 标准电池判定的断言：这台机器上没有 0x85 集合可测，所以唯一能验的就是
 * "什么形状才出数、什么形状必须拒绝"。任何一条被放宽都会把未知变成假数字。
 */

const cases: Array<[string, FeatureRead[], number | null]> = [
  ['唯一合法长度 2、值 56', [{ length: 2, data: [0, 56] }], 56],
  ['唯一合法长度 2、值 100', [{ length: 2, data: [0, 100] }], 100],
  ['唯一合法长度 2、值 0', [{ length: 2, data: [0, 0] }], null],
  ['唯一合法长度 2、值 101', [{ length: 2, data: [0, 101] }], null],
  ['合法长度 2 和 9 都读得通（设备不校验长度）', [
    { length: 2, data: [0, 56] },
    { length: 9, data: [0, 56, 0, 0, 0, 0, 0, 0, 0] }
  ], null],
  ['唯一合法长度 9（无法把字节归给 usage）', [
    { length: 9, data: [0, 56, 0, 0, 0, 0, 0, 0, 0] }
  ], null],
  ['一个长度都读不通', [], null]
]

let failed = 0
for (const [label, reads, expect] of cases) {
  const got = pickBatteryValue(reads)
  const ok = got === expect
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} -> ${got}   (期望 ${expect})`)
}

if (failed) {
  console.log(`\n${failed} 条不通过`)
  process.exitCode = 1
} else {
  console.log('\n全部通过')
}
