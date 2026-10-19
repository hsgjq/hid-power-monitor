<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { AppSettings, PowerDeviceReading, PowerSnapshot } from '@shared/types'
import DeviceIcon from './components/DeviceIcon.vue'

/*
 * 桌面浮条：整条可拖（app-region: drag），只读不响应点击。
 *
 * 尺寸不写死：内容宽度取决于当前插着几台设备，所以量完自身尺寸回传给主进程改窗口。
 * 一台设备都没有时也保留这一条并显示 --，不让它凭空消失——浮条突然没了会被当成程序挂了。
 */

const snapshot = ref<PowerSnapshot | null>(null)
const settings = ref<AppSettings | null>(null)
const root = ref<HTMLElement | null>(null)

let unsubscribe: (() => void) | null = null
let unsubscribeSettings: (() => void) | null = null
let observer: ResizeObserver | null = null
let sentSize = ''

const KIND_RANK: Record<PowerDeviceReading['kind'], number> = { keyboard: 0, mouse: 1, receiver: 2 }

// 浮条固定"键盘在左、鼠标在右"，不跟面板的排序走：位置稳定才不用每次重新认
const devices = computed<PowerDeviceReading[]>(() =>
  [...(snapshot.value?.devices ?? [])].sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind])
)

function applySettings(next: AppSettings | null): void {
  settings.value = next
  // 没设置时删掉变量，让 CSS 回落到默认白；留着旧值会在用户改回默认后继续生效
  if (next?.stripTextColor) {
    document.documentElement.style.setProperty('--strip-text', next.stripTextColor)
  } else {
    document.documentElement.style.removeProperty('--strip-text')
  }
}

// 低电的分界跟着设置走：把提醒调到 40%，浮条也要在 40% 就变脸色，不能还守着 20
const lowAt = computed(() => settings.value?.lowBatteryPercent ?? 15)

function isLow(device: PowerDeviceReading): boolean {
  return lowAt.value > 0 && device.percent !== null && device.percent <= lowAt.value
}

/*
 * 拖动：按下时告诉主进程"光标在哪、窗口在哪"的差值，之后每帧最多发一次屏幕坐标让它摆放。
 * 用 pointermove 的 screenX/screenY（真实屏幕坐标），不能用 movementX/clientX——窗口跟着
 * 光标走之后那些值会被窗口位移抵消，手感变成"粘住不动"。按帧节流是因为鼠标上报频率
 * 可能到 1000Hz，逐条发会把 IPC 灌满。
 */
let dragging = false
let pendingCursor: { x: number; y: number } | null = null
let scheduled = 0

function flushDrag(): void {
  scheduled = 0
  if (!pendingCursor) return
  const cursor = pendingCursor
  pendingCursor = null
  window.power.moveStripDrag(cursor)
}

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0) return
  dragging = true
  ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
  window.power.beginStripDrag({ x: event.screenX, y: event.screenY })
}

function onPointerMove(event: PointerEvent): void {
  if (!dragging) return
  pendingCursor = { x: event.screenX, y: event.screenY }
  if (!scheduled) scheduled = requestAnimationFrame(flushDrag)
}

function onPointerEnd(): void {
  if (!dragging) return
  dragging = false
  if (scheduled) {
    cancelAnimationFrame(scheduled)
    scheduled = 0
  }
  pendingCursor = null
  window.power.endStripDrag()
}

function tone(device: PowerDeviceReading): string {
  if (device.charging === true) return 'charge'
  if (device.percent === null) return 'unknown'
  if (isLow(device)) return 'low'
  return 'normal'
}

function label(device: PowerDeviceReading): string {
  const name = [device.brand, device.name].filter(Boolean).join(' ')
  if (device.charging === true) return `${name} 充电中`
  if (device.percent === null) return `${name} ${device.note ?? '暂无读数'}`
  return `${name} ${device.percent}%${device.stale ? '（上次读数）' : ''}`
}

async function fitToContent(): Promise<void> {
  await nextTick()
  const element = root.value
  if (!element) return
  const size = `${element.offsetWidth}x${element.offsetHeight}`
  if (size === sentSize) return
  sentSize = size
  window.power.resizeStrip(element.offsetWidth, element.offsetHeight)
}

onMounted(async () => {
  unsubscribe = window.power.onSnapshot((next) => {
    snapshot.value = next
  })
  unsubscribeSettings = window.power.onSettings(applySettings)
  snapshot.value = await window.power.getSnapshot()
  applySettings(await window.power.getSettings())
  await fitToContent()

  if (root.value) {
    observer = new ResizeObserver(() => void fitToContent())
    observer.observe(root.value)
  }
})

onBeforeUnmount(() => {
  unsubscribe?.()
  unsubscribeSettings?.()
  observer?.disconnect()
})
</script>

<template>
  <div
    ref="root"
    class="strip"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerEnd"
    @pointercancel="onPointerEnd"
    @lostpointercapture="onPointerEnd"
  >
    <span
      v-for="device in devices"
      :key="device.id"
      class="strip__item"
      :data-tone="tone(device)"
      :data-stale="device.stale ? 'true' : 'false'"
      :title="label(device)"
    >
      <DeviceIcon :kind="device.kind" :size="13" />
      <!--
        异常状态先靠形状、再靠颜色：自定义文字色可能正好撞上某个状态色
        （例如挑了 #f2a79f，低电就与正常同色），只换颜色会看不出状态变了。
      -->
      <svg
        v-if="device.charging === true"
        class="strip__mark"
        width="8"
        height="11"
        viewBox="0 0 9 12"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M5.8 0 .8 6.9h2.6L3 12l5-6.9H5.4z" />
      </svg>
      <svg
        v-else-if="isLow(device)"
        class="strip__mark"
        width="11"
        height="11"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        stroke-width="1.2"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <path d="M6 1.4 11 10.4H1z" />
        <path d="M6 4.8v2.4M6 9.1h.01" />
      </svg>
      <span class="strip__value">
        {{ device.percent === null ? '--' : device.percent }}<span class="strip__unit">%</span>
      </span>
    </span>

    <span v-if="devices.length === 0" class="strip__item" data-tone="unknown">
      <span class="strip__value">--<span class="strip__unit">%</span></span>
    </span>
  </div>
</template>
