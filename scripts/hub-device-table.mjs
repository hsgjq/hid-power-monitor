import { readFileSync } from 'node:fs'

const text = readFileSync('probe-results/hub2/main.js', 'utf8')

const entryRe =
  /customName':'([^']{1,40})','pId':(0x[0-9a-f]+),'vId':(0x[0-9a-f]+),'wireless':(0x[01]),'deviceType':(0x[0-9a-f]+),'usage':(0x[0-9a-f]+),'usagePage':(0x[0-9a-f]+)/g

const rows = new Map()
for (const m of text.matchAll(entryRe)) {
  rows.set(`${m[3]}:${m[2]}`, { name: m[1], vId: m[3], pId: m[2], wireless: m[4], type: m[5], usage: m[6], page: m[7] })
}

console.log('named entries:', rows.size)
for (const r of rows.values()) {
  console.log(`${r.vId}:${r.pId} wireless=${r.wireless} page=${r.page} usage=${r.usage} type=${r.type}  ${r.name}`)
}

// looser scan: any pId/vId pair anywhere, plus any Telink VID mention
const pairRe = /'pId':(0x[0-9a-f]+),'vId':(0x[0-9a-f]+)/g
const pairs = new Map()
for (const m of text.matchAll(pairRe)) pairs.set(`${m[2]}:${m[1]}`, (pairs.get(`${m[2]}:${m[1]}`) ?? 0) + 1)
console.log('\nall pId/vId pairs:', pairs.size)
const byVendor = new Map()
for (const key of pairs.keys()) {
  const vid = key.split(':')[0]
  byVendor.set(vid, (byVendor.get(vid) ?? 0) + 1)
}
console.log([...byVendor.entries()].sort((a, b) => b[1] - a[1]).map(([v, c]) => `${v} x${c}`).join('  '))

for (const needle of ['0x248a', '0x5b2f', '0x5b2e', '23598', '23343']) {
  const hits = [...text.matchAll(new RegExp(needle, 'g'))].length
  console.log(`needle ${needle}: ${hits}`)
}
