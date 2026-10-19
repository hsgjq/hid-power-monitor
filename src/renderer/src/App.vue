<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { PowerDeviceReading, PowerSnapshot } from '@shared/types'
import DeviceRow from './components/DeviceRow.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import { playLowBatteryChime } from './alert-sound'
import { timeOf } from './format'

const snapshot = ref<PowerSnapshot | null>(null)
const refreshing = ref(false)
const view = ref<'devices' | 'settings'>('devices')
const panel = ref<HTMLElement | null>(null)

let unsubscribe: (() => void) | null = null
let unsubscribeAlert: (() => void) | null = null
let resetTimer: number | null = null
let observer: ResizeObserver | null = null
let sentHeight = 0

const devices = computed<PowerDeviceReading[]>(() => snapshot.value?.devices ?? [])
const stamp = computed(() => timeOf(snapshot.value?.generatedAt ?? null))

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') window.power.hide()
}

function stopRefreshing(): void {
  if (resetTimer !== null) {
    clearTimeout(resetTimer)
    resetTimer = null
  }
  refreshing.value = false
}

function refresh(): void {
  stopRefreshing()
  refreshing.value = true
  window.power.refresh()
  resetTimer = window.setTimeout(stopRefreshing, 8000)
}

function hide(): void {
  window.power.hide()
}

function quit(): void {
  window.power.quit()
}

function toggleView(): void {
  view.value = view.value === 'devices' ? 'settings' : 'devices'
}

async function followContentHeight(): Promise<void> {
  await nextTick()
  if (!panel.value) return
  const height = panel.value.offsetHeight + 20
  if (Math.abs(height - sentHeight) < 2) return
  sentHeight = height
  window.power.resize(height)
}

onMounted(async () => {
  unsubscribe = window.power.onSnapshot((next) => {
    snapshot.value = next
    stopRefreshing()
  })
  unsubscribeAlert = window.power.onAlert(() => playLowBatteryChime())
  snapshot.value = await window.power.getSnapshot()
  window.addEventListener('keydown', onKeydown)

  await followContentHeight()
  if (panel.value) {
    observer = new ResizeObserver(() => void followContentHeight())
    observer.observe(panel.value)
  }
})

onBeforeUnmount(() => {
  unsubscribe?.()
  unsubscribeAlert?.()
  observer?.disconnect()
  if (resetTimer !== null) clearTimeout(resetTimer)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <main ref="panel" class="flyout">
    <header class="flyout__bar">
      <h1 class="flyout__title">{{ view === 'devices' ? '设备电量' : '设置' }}</h1>
      <span v-if="view === 'devices'" class="flyout__stamp">{{ stamp }}</span>
    </header>

    <SettingsPanel v-if="view === 'settings'" />
    <p v-else-if="devices.length === 0" class="empty">没有检测到 2.4G 接收器</p>
    <ul v-else class="devices">
      <DeviceRow v-for="device in devices" :key="device.id" :reading="device" />
    </ul>

    <footer class="flyout__foot">
      <button v-if="view === 'devices'" class="action" :disabled="refreshing" @click="refresh">
        {{ refreshing ? '刷新中' : '刷新' }}
      </button>
      <button class="action" @click="toggleView">{{ view === 'devices' ? '设置' : '返回' }}</button>
      <span class="spacer"></span>
      <button class="action" @click="hide">收起</button>
      <button class="action action--danger" @click="quit">退出</button>
    </footer>
  </main>
</template>
