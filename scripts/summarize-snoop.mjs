import { readFileSync } from 'node:fs'

const file = process.argv[2] ?? 'probe-results/snoop-248a.log'
const lines = readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean)

const summary = { openOk: [], openFail: [], other: [] }
const inputs = new Map()
const features = []

for (const line of lines) {
  const time = /\[(\d{2}:\d{2}:\d{2}\.\d{3})\]/.exec(line)?.[1] ?? ''
  if (line.includes('open-ok')) summary.openOk.push(line)
  else if (line.includes('OPEN-FAIL')) summary.openFail.push(line)
  else if (line.includes('FEATURE')) features.push({ time, line })
  else if (line.includes('INPUT')) {
    const m = /INPUT (\S+) ([0-9a-f]+)$/.exec(line)
    if (!m) {
      summary.other.push(line)
      continue
    }
    const [, label, hex] = m
    if (!inputs.has(label)) inputs.set(label, { count: 0, firstBytes: new Map(), lens: new Map(), samples: [], times: [] })
    const bucket = inputs.get(label)
    bucket.count += 1
    const fb = hex.slice(0, 2)
    bucket.firstBytes.set(fb, (bucket.firstBytes.get(fb) ?? 0) + 1)
    bucket.lens.set(hex.length / 2, (bucket.lens.get(hex.length / 2) ?? 0) + 1)
    if (bucket.samples.length < 6) bucket.samples.push(`${time} ${hex.slice(0, 64)}`)
    bucket.times.push(time)
  } else if (line.includes('read-err') || line.includes('done') || line.includes('window=')) {
    summary.other.push(line)
  }
}

console.log('lines:', lines.length)
console.log('open-ok:', summary.openOk.map((l) => l.split('open-ok')[1].trim()).join(' | '))
console.log('open-fail:')
for (const l of summary.openFail) console.log('  ', l)
console.log('\n=== INPUT per channel')
for (const [label, b] of [...inputs.entries()].sort((x, y) => y[1].count - x[1].count)) {
  console.log(`${label}  count=${b.count}  len=${[...b.lens.keys()].join(',')}  firstByte=${[...b.firstBytes.entries()].sort((p, q) => q[1] - p[1]).slice(0, 6).map(([k, v]) => k + 'x' + v).join(' ')}`)
  for (const s of b.samples.slice(0, 3)) console.log('    ', s)
  console.log('     window:', b.times[0], '->', b.times[b.times.length - 1])
}
console.log('\n=== FEATURE changes observed:', features.length)
for (const f of features.slice(0, 20)) console.log('  ', f.line)
console.log('\n=== misc')
for (const l of summary.other.slice(0, 12)) console.log('  ', l)
