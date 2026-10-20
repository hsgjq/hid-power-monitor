<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { AppSettings, PowerDeviceReading, PowerSnapshot } from '@shared/types'
import DeviceIcon from './components/DeviceIcon.vue'

/*
 * 桌面浮条：整条可拖（pointer 事件 + 主进程按坐标摆窗），只读不响应点击。
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
 * 拖动：按下时告诉主进程"光标在哪、窗口在哪"的差值，之后把屏幕坐标交给它摆放。
 * 用 pointermove 的 screenX/screenY（真实屏幕坐标），不能用 movementX/clientX——窗口跟着
 * 光标走之后那些值会被窗口位移抵消，手感变成"粘住不动"。
 *
 * 两个刻意不依赖的东西：
 * 1) 不靠 requestAnimationFrame 投递位移。锁屏再解锁之后 Chromium 可能不再给这个窗口发帧
 *    （它被算作被遮挡），那时鼠标事件照样到、rAF 回调却不跑，浮条就再也拖不动了。
 *    现在按时间自己在事件里节流，1000Hz 的鼠标也不会把 IPC 灌满。
 * 2) 不把 setPointerCapture 放在 begin 之前。它的 pointerId 在解锁后可能是失效的，抛异常
 *    就会让主进程收不到"按下"，之后每次 move 都因为没有偏移量而被丢掉——这个状态自己不会恢复，
 *    只有重启或重建浮条才好，正是之前那个 bug 的样子。
 */
let dragging = false
let lastSentAt = 0
const SEND_INTERVAL_MS = 8

function sendMove(cursor: { x: number; y: number }, force: boolean): void {
  const now = performance.now()
  if (!force && now - lastSentAt < SEND_INTERVAL_MS) return
  lastSentAt = now
  window.power.moveStripDrag(cursor)
}

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0) return
  dragging = true
  window.power.beginStripDrag({ x: event.screenX, y: event.screenY })
  try {
    ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
  } catch {
    // 指针捕获只是让鼠标移出浮条也能收到 up，失败不该影响拖动本身
  }
}

function onPointerMove(event: PointerEvent): void {
  if (!dragging) return
  // 键没按着就说明这次拖动早就结束了：指针捕获没成功时，鼠标在浮条外松开我们收不到 up，
  // 少了这道判断，松开后光是划过浮条就会把它拖着走
  if ((event.buttons & 1) === 0) {
    onPointerEnd()
    return
  }
  sendMove({ x: event.screenX, y: event.screenY }, false)
}

function onPointerEnd(event?: PointerEvent): void {
  if (!dragging) return
  dragging = false
  if (event) sendMove({ x: event.screenX, y: event.screenY }, true)
  window.power.endStripDrag()
}

function tone(device: PowerDeviceReading): string {
  if (device.charging === true) return 'charge'
  if (device.percent === null) return 'unknown'
  if (isLow(device)) return 'low'
  return 'normal'
}

/*
 * 浮条上"充电中"这一档不写数字：那时设备根本没在报电量，那一格数是沿用接入前的旧值，
 * 而浮条没有地方解释"这是上次的"，写个数就会被当即时电量——正是之前那个"在充电却显示 100%"
 * 被误读成"充满了"的原因。已充满（设备当场报的 100）不一样，照写。
 */
function showPercent(device: PowerDeviceReading): boolean {
  return device.percent !== null && !(device.charging === true && device.stale)
}

function label(device: PowerDeviceReading): string {
  const name = [device.brand, device.name].filter(Boolean).join(' ')
  if (device.charging === true) {
    if (device.chargeLevel === 'full') return `${name} 已充满 ${device.percent ?? '--'}%`
    return `${name} 充电中${device.percent === null ? '' : `（接入前 ${device.percent}%）`}`
  }
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
      <span v-if="showPercent(device)" class="strip__value">
        {{ device.percent }}<span class="strip__unit">%</span>
      </span>
      <!-- 充电中且不写数时就只剩图标加闪电；"没读到"仍然给 --，两种情况要看得出区别 -->
      <span v-else-if="device.charging !== true" class="strip__value">
        --<span class="strip__unit">%</span>
      </span>
    </span>

    <span v-if="devices.length === 0" class="strip__item" data-tone="unknown">
      <span class="strip__value">--<span class="strip__unit">%</span></span>
    </span>
  </div>
</template>
