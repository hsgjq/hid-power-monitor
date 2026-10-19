<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { AppSettings } from '@shared/types'
import { playLowBatteryChime } from '../alert-sound'

/*
 * 设置项。控件全是原生 checkbox / button 加样式，没有自绘：开关是 appearance:none
 * 的 checkbox 配 role="switch"，保留空格切换和 focus-visible 描边。
 * 阈值 0 表示整条提醒关闭，此时提示音那一行直接不渲染，不留一个按了没反应的死控件。
 * 打开提示音时立刻响一声，作为"这功能生效了"的即时反馈。
 */

const STEP = 5
const MAX = 50

const settings = ref<AppSettings | null>(null)

async function save(patch: Partial<AppSettings>): Promise<void> {
  settings.value = await window.power.saveSettings(patch)
}

function onToggle(event: Event): void {
  void save({ autoLaunch: (event.target as HTMLInputElement).checked })
}

async function onSoundToggle(event: Event): Promise<void> {
  const enabled = (event.target as HTMLInputElement).checked
  settings.value = await window.power.saveSettings({ soundAlert: enabled })
  if (enabled) playLowBatteryChime()
}

function step(delta: number): void {
  if (!settings.value) return
  const next = Math.min(MAX, Math.max(0, settings.value.lowBatteryPercent + delta))
  if (next !== settings.value.lowBatteryPercent) void save({ lowBatteryPercent: next })
}

onMounted(async () => {
  settings.value = await window.power.getSettings()
})
</script>

<template>
  <ul v-if="settings" class="settings">
    <li class="setting">
      <div>
        <p class="setting__label">开机自启</p>
        <p class="setting__hint">登录后自动在托盘运行</p>
      </div>
      <input class="switch" type="checkbox" role="switch" :checked="settings.autoLaunch" aria-label="开机自启"
        @change="onToggle" />
    </li>

    <li class="setting">
      <div>
        <p class="setting__label">低电量提醒</p>
        <p class="setting__hint">低于该值时弹一次系统通知</p>
      </div>
      <div class="stepper">
        <button class="stepper__btn" type="button" aria-label="降低阈值" :disabled="settings.lowBatteryPercent <= 0"
          @click="step(-STEP)">
          &minus;
        </button>
        <span class="stepper__value">
          {{ settings.lowBatteryPercent === 0 ? '关闭' : `${settings.lowBatteryPercent}%` }}
        </span>
        <button class="stepper__btn" type="button" aria-label="提高阈值" :disabled="settings.lowBatteryPercent >= MAX"
          @click="step(STEP)">
          +
        </button>
      </div>
    </li>

    <li v-if="settings.lowBatteryPercent > 0" class="setting">
      <div>
        <p class="setting__label">低电量提示音</p>
        <p class="setting__hint">打开时会先响一声</p>
      </div>
      <input class="switch" type="checkbox" role="switch" :checked="settings.soundAlert" aria-label="低电量提示音"
        @change="onSoundToggle" />
    </li>
  </ul>
</template>
