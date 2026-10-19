import { readFileSync, writeFileSync } from 'node:fs'

const styleFiles = [
  'tokens.css',
  'base.css',
  'panel.css',
  'device.css',
  'settings.css',
  'strip.css'
]
const css = styleFiles
  .map((name) => readFileSync(`src/renderer/src/styles/${name}`, 'utf8'))
  .join('\n')

const keyboardIcon = `<svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><rect x="1.9" y="4.6" width="13.2" height="7.8" rx="1.8"/><path d="M4.6 7.3h.7M7.2 7.3h.7M9.8 7.3h.7M12.4 7.3h.1M4.9 10h7.2"/></svg>`
const mouseIcon = `<svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><rect x="4.1" y="2" width="8.8" height="13" rx="4.4"/><path d="M8.5 4.9v2.6"/></svg>`
const bolt = `<svg class="device__bolt" width="9" height="12" viewBox="0 0 9 12" fill="currentColor"><path d="M5.8 0 .8 6.9h2.6L3 12l5-6.9H5.4z"/></svg>`

const diagItems = [
  ['05AC:024F', 'Compx / 2.4G Wireless Receiver', '已登记协议 · 7 个集合', true],
  ['248A:5B2F', 'SSCYPL / Wireless-Receiver', '已登记协议 · 8 个集合', true],
  ['001F:BA1C', 'DJP Inc. / Virtual Multitouch Device', '没有厂商自定义集合，字符串也不像 2.4G 接收器', false],
  ['00FF:BACC', 'DJP Inc. / Virtual Multitouch Device', '没有厂商自定义集合，字符串也不像 2.4G 接收器', false],
  ['045E:0000', '（无产品串）', '没有厂商自定义集合，字符串也不像 2.4G 接收器', false],
  ['048D:8051', 'Microsoft / HIDI2C Device', '没有厂商自定义集合，字符串也不像 2.4G 接收器', false],
  ['0A67:D006', 'K9U PRO / K9U PRO', '没有厂商自定义集合，字符串也不像 2.4G 接收器', false],
  ['0B05:6203', 'ASUSTeK / C-Media(R) Audio', '没有厂商自定义集合，字符串也不像 2.4G 接收器', false],
  ['2808:0104', 'Microsoft / HIDI2C Device', '没有厂商自定义集合，字符串也不像 2.4G 接收器', false],
  ['8087:0A1E', '（无产品串）', '没有厂商自定义集合，字符串也不像 2.4G 接收器', false]
].map(([id, name, reason, shown]) => `<li class="diag__item" data-shown="${shown}">
    <p class="diag__id">${id} <span class="diag__name">${name}</span></p>
    <p class="diag__reason">${reason}</p>
  </li>`).join('')

const settingsDiag = `<ul class="settings">
  <li class="setting">
    <div><p class="setting__label">开机自启</p><p class="setting__hint">登录后自动在托盘运行</p></div>
    <input class="switch" type="checkbox" role="switch" aria-label="开机自启" checked />
  </li>
  <li class="setting">
    <div><p class="setting__label">低电量提醒</p><p class="setting__hint">低于该值时弹一次系统通知</p></div>
    <div class="stepper">
      <button class="stepper__btn" type="button">&minus;</button>
      <span class="stepper__value">15%</span>
      <button class="stepper__btn" type="button">+</button>
    </div>
  </li>
  <li class="setting">
    <div><p class="setting__label">低电量提示音</p><p class="setting__hint">打开时会先响一声给你听</p></div>
    <input class="switch" type="checkbox" role="switch" aria-label="低电量提示音" checked />
  </li>
  <li class="setting setting--wide">
    <details class="diag" open>
      <summary class="diag__summary"><span>检测到的 HID 设备</span><span class="diag__count">10</span></summary>
      <div class="diag__body">
        <ul class="diag__list">${diagItems}</ul>
        <button class="action diag__copy" type="button">复制清单</button>
      </div>
    </details>
  </li>
</ul>`

const settingsColor = `<ul class="settings">
  <li class="setting">
    <div><p class="setting__label">开机自启</p><p class="setting__hint">打包成 exe 后此项才生效</p></div>
    <input class="switch" type="checkbox" role="switch" aria-label="开机自启" checked disabled />
  </li>
  <li class="setting">
    <div><p class="setting__label">低电量提醒</p><p class="setting__hint">低于该值时弹一次系统通知</p></div>
    <div class="stepper">
      <button class="stepper__btn" type="button">&minus;</button>
      <span class="stepper__value">15%</span>
      <button class="stepper__btn" type="button">+</button>
    </div>
  </li>
  <li class="setting">
    <div><p class="setting__label">低电量提示音</p><p class="setting__hint">打开时会先响一声给你听</p></div>
    <input class="switch" type="checkbox" role="switch" aria-label="低电量提示音" checked />
  </li>
  <li class="setting">
    <div><p class="setting__label">桌面浮条</p><p class="setting__hint">在屏幕上常驻一条电量，可拖动</p></div>
    <input class="switch" type="checkbox" role="switch" aria-label="桌面浮条" checked />
  </li>
  <li class="setting">
    <div><p class="setting__label">浮条文字颜色</p><p class="setting__hint">低电与充电会另显示图标</p></div>
    <div class="setting__side">
      <button class="action" type="button">默认</button>
      <input class="swatch" type="color" value="#ffd166" aria-label="浮条文字颜色" />
    </div>
  </li>
  <li class="setting setting--wide">
    <details class="diag">
      <summary class="diag__summary"><span>检测到的 HID 设备</span><span class="diag__count">10</span></summary>
    </details>
  </li>
</ul>`

function row({ kind, brand, name, state, percent, tone, meta, stale = false }) {
  const width = percent === null ? 0 : Math.max(3, percent)
  const value = percent === null ? '--' : `${percent}<small>%</small>`
  return `<li class="device" data-state="${state}" data-stale="${stale}">
    <span class="device__glyph">${kind === 'keyboard' ? keyboardIcon : mouseIcon}</span>
    <div class="device__body">
      <p class="device__name">${brand} ${name}</p>
      <p class="device__meta">${meta}</p>
    </div>
    <div class="device__readout">
      <p class="device__value">${state === 'charging' ? bolt : ''}${value}</p>
      <div class="device__battery"><span class="battery" data-tone="${tone}" data-stale="${stale}"><span class="battery__fill" style="width:${width}%"></span></span></div>
    </div>
  </li>`
}

const devicesBody = `<ul class="devices">
  ${row({ kind: 'keyboard', brand: '迈从', name: '无线键盘', state: 'ok', percent: 69, tone: 'normal', meta: '2.4G · 22:41' })}
  ${row({ kind: 'mouse', brand: '狼蛛', name: '无线鼠标', state: 'ok', percent: 56, tone: 'normal', meta: '2.4G · 22:41' })}
</ul>`

const devicesLow = `<ul class="devices">
  ${row({ kind: 'keyboard', brand: '迈从', name: '无线键盘', state: 'low', percent: 12, tone: 'low', meta: '2.4G · 22:41' })}
  ${row({ kind: 'mouse', brand: '狼蛛', name: '无线鼠标', state: 'ok', percent: 56, tone: 'normal', meta: '2.4G · M137 · 上次 21:58', stale: true })}
</ul>`

const devicesCharging = `<ul class="devices">
  ${row({ kind: 'mouse', brand: '狼蛛', name: '无线鼠标', state: 'charging', percent: 54, tone: 'charge', meta: '2.4G · 充电中 · 上次 05:20', stale: true })}
  ${row({ kind: 'keyboard', brand: '迈从', name: '无线键盘', state: 'unsupported', percent: null, tone: 'unknown', meta: '接收器没有响应电量查询' })}
</ul>`

const settingsBody = `<ul class="settings">
  <li class="setting">
    <div><p class="setting__label">开机自启</p><p class="setting__hint">登录后自动在托盘运行</p></div>
    <input class="switch" type="checkbox" role="switch" aria-label="开机自启" checked />
  </li>
  <li class="setting">
    <div><p class="setting__label">低电量提醒</p><p class="setting__hint">低于该值时弹一次系统通知</p></div>
    <div class="stepper">
      <button class="stepper__btn" type="button" aria-label="降低阈值">&minus;</button>
      <span class="stepper__value">15%</span>
      <button class="stepper__btn" type="button" aria-label="提高阈值">+</button>
    </div>
  </li>
</ul>`

const settingsOff = `<ul class="settings">
  <li class="setting">
    <div><p class="setting__label">开机自启</p><p class="setting__hint">登录后自动在托盘运行</p></div>
    <input class="switch" type="checkbox" role="switch" aria-label="开机自启" />
  </li>
  <li class="setting">
    <div><p class="setting__label">低电量提醒</p><p class="setting__hint">低于该值时弹一次系统通知</p></div>
    <div class="stepper">
      <button class="stepper__btn" type="button" aria-label="降低阈值" disabled>&minus;</button>
      <span class="stepper__value">关闭</span>
      <button class="stepper__btn" type="button" aria-label="提高阈值">+</button>
    </div>
  </li>
</ul>`

function panel({ title, stamp, body, foot }) {
  return `<div class="shot">
    <p class="shot__label">${title}</p>
    <div class="frame"><div id="app"><main class="flyout">
      <header class="flyout__bar"><h1 class="flyout__title">${title}</h1>${stamp}</header>
      ${body}
      <footer class="flyout__foot">${foot}</footer>
    </main></div></div>
  </div>`
}

const devicesFoot = `<button class="action">刷新</button><button class="action">设置</button><span class="spacer"></span><button class="action">收起</button><button class="action action--danger">退出</button>`
const settingsFoot = `<button class="action">返回</button><span class="spacer"></span><button class="action">收起</button><button class="action action--danger">退出</button>`
const stamp = `<span class="flyout__stamp">22:41</span>`

const stripBolt = `<svg class="strip__mark" width="8" height="11" viewBox="0 0 9 12" fill="currentColor"><path d="M5.8 0 .8 6.9h2.6L3 12l5-6.9H5.4z"/></svg>`
const stripWarn = `<svg class="strip__mark" width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M6 1.4 11 10.4H1z"/><path d="M6 4.8v2.4M6 9.1h.01"/></svg>`

function stripShot(textColor, caption) {
  return `<div class="shot">
  <p class="shot__label">${caption}</p>
  <div class="stripwrap"><div class="strip" style="--strip-text:${textColor}">
    <span class="strip__item" data-tone="normal">${mouseIcon}<span class="strip__value">51<span class="strip__unit">%</span></span></span>
    <span class="strip__item" data-tone="charge">${keyboardIcon}${stripBolt}<span class="strip__value">67<span class="strip__unit">%</span></span></span>
    <span class="strip__item" data-tone="low">${mouseIcon}${stripWarn}<span class="strip__value">12<span class="strip__unit">%</span></span></span>
    <span class="strip__item" data-tone="unknown">${mouseIcon}<span class="strip__value">--<span class="strip__unit">%</span></span></span>
  </div></div>
</div>`
}

const stripShots = [
  stripShot('#ffd166', '浮条 · 自定义文字色 #ffd166（四种状态）'),
  // 挑的颜色正好等于低电状态色：读数分不开，只能靠闪电/警告这两个形状
  stripShot('#f2a79f', '浮条 · 挑色撞车 #f2a79f（与低电状态色同值）')
].join('')

const shots = [
  panel({ title: '设备视图', stamp, body: devicesBody, foot: devicesFoot }),
  panel({ title: '设备视图 · 充电中 + 未识别', stamp: '', body: devicesCharging, foot: devicesFoot }),
  panel({ title: '设置视图 · 含浮条颜色', stamp: '', body: settingsColor, foot: settingsFoot }),
  panel({ title: '设置视图 · 展开诊断', stamp: '', body: settingsDiag, foot: settingsFoot }),
  stripShots
].join('')

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<title>panel preview</title>
<style>
${css}
body { background: #3a3f45; overflow: auto; user-select: none; }
.sheet { display: flex; flex-wrap: wrap; gap: 34px; padding: 26px; align-items: flex-start; }
.frame { width: 340px; background: #6b7280; }
.stripwrap { display: inline-block; padding: 26px 34px; background: linear-gradient(135deg,#f4f5f7,#8d949c); border-radius: 8px; }
.shot__label { color: #d7dbe0; font: 400 12px/1.6 "Microsoft YaHei UI", sans-serif; margin-bottom: 8px; }
</style>
</head>
<body>
<div class="sheet">${shots}</div>
</body>
</html>`

writeFileSync('probe-results/panel-preview.html', html)
console.log('written', html.length, 'bytes')
