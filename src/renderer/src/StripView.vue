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
const root = ref<HTMLElement | null>(null)

let unsubscribe: (() => void) | null = null
let unsubscribeSettings: (() => void) | null = null
let observer: ResizeObserver | null = null
let sentSize = ''

const devices = computed<PowerDeviceReading[]>(() => snapshot.value?.devices ?? [])

function applyTextColor(settings: AppSettings | null): void {
  // 没设置时删掉变量，让 CSS 回落到默认白；留着旧值会在用户改回默认后继续生效
  if (settings?.stripTextColor) {
    document.documentElement.style.setProperty('--strip-text', settings.stripTextColor)
  } else {
    document.documentElement.style.removeProperty('--strip-text')
  }
}

function tone(device: PowerDeviceReading): string {
  if (device.charging === true) return 'charge'
  if (device.percent === null) return 'unknown'
  if (device.percent <= 20) return 'low'
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
  unsubscribeSettings = window.power.onSettings(applyTextColor)
  snapshot.value = await window.power.getSnapshot()
  applyTextColor(await window.power.getSettings())
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
  <div ref="root" class="strip">
    <span
      v-for="device in devices"
      :key="device.id"
      class="strip__item"
      :data-tone="tone(device)"
      :data-stale="device.stale ? 'true' : 'false'"
      :title="label(device)"
    >
      <DeviceIcon :kind="device.kind" :size="13" />
      <span class="strip__value">
        {{ device.percent === null ? '--' : device.percent }}<span class="strip__unit">%</span>
      </span>
    </span>

    <span v-if="devices.length === 0" class="strip__item" data-tone="unknown">
      <span class="strip__value">--<span class="strip__unit">%</span></span>
    </span>
  </div>
</template>
