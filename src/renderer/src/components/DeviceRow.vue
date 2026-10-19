<script setup lang="ts">
import { computed } from 'vue'
import type { PowerDeviceReading } from '@shared/types'
import BatteryGlyph from './BatteryGlyph.vue'
import DeviceIcon from './DeviceIcon.vue'
import { LINK_LABEL, timeOf } from '../format'

/*
 * 一行一台设备。状态只决定配色和图标，"读数是否还作数"由 stale 单独标记，
 * 两者要能同时成立——例如充电中就既是 charging 又是 stale。
 */

const props = defineProps<{ reading: PowerDeviceReading }>()

const title = computed(() => [props.reading.brand, props.reading.name].filter(Boolean).join(' '))

const state = computed(() => {
  const reading = props.reading
  if (reading.status === 'absent') return 'absent'
  // 充电优先于"没有读数"：这时数字是 service 补的接入前真值，不是空值
  if (reading.charging === true) return 'charging'
  if (reading.percent === null) return 'unsupported'
  if (reading.percent <= 20) return 'low'
  return 'ok'
})

const meta = computed(() => {
  const reading = props.reading
  if (reading.percent === null) return reading.note ?? '暂无读数'

  const time = timeOf(reading.updatedAt)
  const parts = [LINK_LABEL[reading.link]]
  // 型号和"充电中"二选一，两个都上副标题会挤不下
  if (reading.charging === true) parts.push('充电中')
  else if (reading.model) parts.push(reading.model)
  if (time) parts.push(reading.stale ? `上次 ${time}` : time)
  return parts.join(' · ')
})
</script>

<template>
  <li class="device" :data-state="state" :data-stale="reading.stale ? 'true' : 'false'">
    <span class="device__glyph" aria-hidden="true">
      <DeviceIcon :kind="reading.kind" />
    </span>

    <div class="device__body">
      <p class="device__name">{{ title }}</p>
      <p class="device__meta">{{ meta }}</p>
    </div>

    <div class="device__readout">
      <p class="device__value">
        <svg
          v-if="state === 'charging'"
          class="device__bolt"
          width="9"
          height="12"
          viewBox="0 0 9 12"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M5.8 0 .8 6.9h2.6L3 12l5-6.9H5.4z" />
        </svg>
        <template v-if="reading.percent !== null">
          {{ reading.percent }}<small>%</small>
        </template>
        <template v-else>--</template>
      </p>
      <div class="device__battery">
        <BatteryGlyph
          :percent="reading.percent"
          :charging="reading.charging"
          :stale="reading.stale"
        />
      </div>
    </div>
  </li>
</template>
