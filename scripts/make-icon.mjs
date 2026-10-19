// 生成应用图标：把托盘那套自绘电池按矢量条件重画到 16/32/48/256，
// 编码成 PNG 再装进一个 ICO 容器（Vista 之后 ICO 里允许直接放 PNG）。
// 输出 build/icon.png（256）和 build/icon.ico，两者都是产物，不要手改。
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'

const LIGHT = [236, 239, 243]
const DARK = [12, 13, 16]
const FILL = [110, 208, 140]
const SIZES = [16, 32, 48, 256]

// 源坐标系是托盘那张 32x32：外壳 2..26 x 9..24，内腔 4..24 x 11..22，电极 26..28 x 14..19
const BODY = [2, 9, 26, 24]
const HOLE = [4, 11, 24, 22]
const NUB = [26, 14, 28, 19]
const NUB_HOLE = [27, 15, 28, 18]
const INSET = 2

function inside(x, y, rect) {
  return x >= rect[0] && x <= rect[2] && y >= rect[1] && y <= rect[3]
}

function ringOf(x, y) {
  if (!inside(x, y, HOLE)) return false
  const [x0, y0, x1, y1] = HOLE
  return x === x0 || x === x1 || y === y0 || y === y1
}

// 图标是静态的，不该暗示某个具体电量，所以填充固定画到接近满的一格
function fillOf(x, y, level) {
  const inner = HOLE[2] - HOLE[0] - INSET
  const filled = Math.max(1, Math.round((inner * level) / 100))
  return inside(x, y, [HOLE[0] + INSET, HOLE[1] + 1, HOLE[0] + INSET + filled - 1, HOLE[3] - 1])
}

function sample(x, y, level) {
  if (inside(x, y, NUB_HOLE)) return [LIGHT[0], LIGHT[1], LIGHT[2], 255]
  if (inside(x, y, NUB)) return [DARK[0], DARK[1], DARK[2], 215]
  if (inside(x, y, BODY)) {
    if (!inside(x, y, HOLE)) return [DARK[0], DARK[1], DARK[2], 215]
    if (fillOf(x, y, level)) return [FILL[0], FILL[1], FILL[2], 255]
    if (ringOf(x, y)) return [LIGHT[0], LIGHT[1], LIGHT[2], 255]
    return [0, 0, 0, 0]
  }
  return [0, 0, 0, 0]
}

function paint(size, level) {
  const buf = Buffer.alloc(size * size * 4)
  const scale = size / 32
  // 源坐标只有 32 格，256 尺寸下直接取整会得到 8 像素的硬块，所以每格再采四个点求覆盖率
  const sub = 2
  for (let ty = 0; ty < size; ty += 1) {
    for (let tx = 0; tx < size; tx += 1) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < sub; sy += 1) {
        for (let sx = 0; sx < sub; sx += 1) {
          const px = (tx + (sx + 0.5) / sub) / scale
          const py = (ty + (sy + 0.5) / sub) / scale
          const c = sample(px, py, level)
          r += c[0]
          g += c[1]
          b += c[2]
          a += c[3]
        }
      }
      const n = sub * sub
      const i = (ty * size + tx) * 4
      buf[i] = Math.round(r / n)
      buf[i + 1] = Math.round(g / n)
      buf[i + 2] = Math.round(b / n)
      buf[i + 3] = Math.round(a / n)
    }
  }
  return buf
}

const TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i += 1) c = TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

function encodeIco(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  let offset = 6 + 16 * images.length
  const entries = []
  const bodies = []
  for (const img of images) {
    const entry = Buffer.alloc(16)
    // 256 在 ICO 里写成 0，宽度和高度各占一个字节
    entry[0] = img.size === 256 ? 0 : img.size
    entry[1] = img.size === 256 ? 0 : img.size
    entry[4] = 1
    entry[6] = 1
    entry[8] = 32
    entry.writeUInt32LE(img.png.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += img.png.length
    entries.push(entry)
    bodies.push(img.png)
  }
  return Buffer.concat([header, ...entries, ...bodies])
}

mkdirSync('build', { recursive: true })
const level = 88
const images = SIZES.map((size) => ({ size, png: encodePng(size, paint(size, level)) }))
writeFileSync('build/icon.ico', encodeIco(images))
writeFileSync('build/icon.png', images[images.length - 1].png)

import { statSync } from 'node:fs'
for (const f of ['build/icon.ico', 'build/icon.png']) {
  console.log(f, (statSync(f).size / 1024).toFixed(1) + ' KB')
}
console.log('ICO 内嵌尺寸:', images.map((i) => i.size).join('/'), '| 填充按', level + '%')
