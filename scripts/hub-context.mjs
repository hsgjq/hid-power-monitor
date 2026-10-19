import { readFileSync } from 'node:fs'

const file = process.argv[2] ?? 'probe-results/hub2/main.js'
const needles = process.argv.slice(3).length ? process.argv.slice(3) : ['0x248a', '0x5b2f', '0x5b2e', '0xb6a4']
const text = readFileSync(file, 'utf8')

for (const needle of needles) {
  let index = -1
  let count = 0
  while ((index = text.indexOf(needle, index + 1)) >= 0 && count < 8) {
    const start = Math.max(0, index - 260)
    const context = text.slice(start, index + 320).replace(/\s+/g, ' ')
    console.log(`=== ${needle} @${index}`)
    console.log(context)
    console.log()
    count += 1
  }
  if (count === 0) console.log(`=== ${needle}: no hit`)
}
