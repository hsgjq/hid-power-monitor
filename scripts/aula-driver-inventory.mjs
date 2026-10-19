import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const roots = ['C:\\Program Files (x86)\\AULA']

function walk(dir, depth = 0, acc = []) {
  if (depth > 3) return acc
  let entries = []
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch (error) {
    acc.push({ path: dir, error: String(error.message) })
    return acc
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, depth + 1, acc)
      continue
    }
    let size = 0
    try {
      size = statSync(full).size
    } catch {}
    acc.push({ path: full, size })
  }
  return acc
}

const files = roots.filter(existsSync).flatMap((root) => walk(root))
files.sort((a, b) => b.size - a.size)
console.log('total files:', files.length)
for (const f of files.slice(0, 60)) {
  console.log(String(Math.round(f.size / 1024)).padStart(7) + ' KB  ' + f.path)
}

const markers = [
  'electron',
  'app.asar',
  'ffmpeg.dll',
  'Qt5Core',
  'Qt6Core',
  'mscoree.dll',
  'System.Windows.Forms',
  'PresentationFramework',
  'DevExpress',
  'Chrome_RenderWidgetHostHWND',
  'cef',
  'libcef',
  'WebView2',
  'Microsoft.Web.WebView2',
  'Delphi',
  'Embarcadero',
  'CodeGear',
  'fltk',
  'wxWidgets',
  'HidD_SetFeature',
  'HidD_GetFeature',
  'HidD_GetPreparsedData',
  'SetupAPI',
  'hid.dll'
]

const found = new Map()
for (const f of files) {
  if (!/\.(exe|dll|dat|bin|asar|json|js|config|ini|xml)$/i.test(f.path)) continue
  if (f.size > 60 * 1024 * 1024) continue
  let buffer
  try {
    buffer = readFileSync(f.path)
  } catch {
    continue
  }
  const text = buffer.toString('latin1').toLowerCase()
  for (const marker of markers) {
    if (text.includes(marker.toLowerCase())) {
      if (!found.has(marker)) found.set(marker, [])
      found.get(marker).push(f.path.replace(/^C:\\Program Files \(x86\)\\AULA\\?/, '') + ' (' + Math.round(f.size / 1024) + 'KB)')
    }
  }
}

console.log('\n=== framework / HID markers')
for (const [marker, where] of found) {
  console.log(marker + ':')
  for (const w of [...new Set(where)].slice(0, 4)) console.log('   ' + w)
}
