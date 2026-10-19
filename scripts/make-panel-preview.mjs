import { readFileSync, writeFileSync } from 'node:fs'

const css = readFileSync('src/renderer/src/assets/main.css', 'utf8')

const keyboardIcon = `<svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><rect x="1.9" y="4.6" width="13.2" height="7.8" rx="1.8"/><path d="M4.6 7.3h.7M7.2 7.3h.7M9.8 7.3h.7M12.4 7.3h.1M4.9 10h7.2"/></svg>`
const mouseIcon = `<svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><rect x="4.1" y="2" width="8.8" height="13" rx="4.4"/><path d="M8.5 4.9v2.6"/></svg>`
const bolt = `<svg class="device__bolt" width="9" height="12" viewBox="0 0 9 12" fill="currentColor"><path d="M5.8 0 .8 6.9h2.6L3 12l5-6.9H5.4z"/></svg>`

function row({ kind, brand, name, state, percent, tone, meta }) {
  const width = percent === null ? 0 : Math.max(3, percent)
  const value = percent === null ? '--' : `${percent}<small>%</small>`
  return `<li class="device" data-state="${state}">
    <span class="device__glyph">${kind === 'keyboard' ? keyboardIcon : mouseIcon}</span>
    <div class="device__body">
      <p class="device__name">${brand} ${name}</p>
      <p class="device__meta">${meta}</p>
    </div>
    <div class="device__readout">
      <p class="device__value">${state === 'charging' ? bolt : ''}${value}</p>
      <div class="device__battery"><span class="battery" data-tone="${tone}"><span class="battery__fill" style="width:${width}%"></span></span></div>
    </div>
  </li>`
}

const devicesBody = `<ul class="devices">
  ${row({ kind: 'keyboard', brand: '迈从', name: '无线键盘', state: 'ok', percent: 69, tone: 'normal', meta: '2.4G · 22:41' })}
  ${row({ kind: 'mouse', brand: '狼蛛', name: '无线鼠标', state: 'ok', percent: 56, tone: 'normal', meta: '2.4G · 22:41' })}
</ul>`

const devicesLow = `<ul class="devices">
  ${row({ kind: 'keyboard', brand: '迈从', name: '无线键盘', state: 'low', percent: 12, tone: 'low', meta: '2.4G · 22:41' })}
  ${row({ kind: 'mouse', brand: '狼蛛', name: '无线鼠标', state: 'stale', percent: 56, tone: 'stale', meta: '2.4G · 上次 21:58' })}
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

const shots = [
  panel({ title: '设备视图', stamp, body: devicesBody, foot: devicesFoot }),
  panel({ title: '设备视图 · 低电 + 过期', stamp: '', body: devicesLow, foot: devicesFoot }),
  panel({ title: '设置视图', stamp: '', body: settingsBody, foot: settingsFoot }),
  panel({ title: '设置视图 · 关闭态', stamp: '', body: settingsOff, foot: settingsFoot })
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
.shot__label { color: #d7dbe0; font: 400 12px/1.6 "Microsoft YaHei UI", sans-serif; margin-bottom: 8px; }
</style>
</head>
<body>
<div class="sheet">${shots}</div>
</body>
</html>`

writeFileSync('probe-results/panel-preview.html', html)
console.log('written', html.length, 'bytes')
