<script setup lang="ts">
import { computed } from 'vue'
import type { PowerDeviceReading } from '@shared/types'
import BatteryGlyph from './BatteryGlyph.vue'
import { LINK_LABEL, timeOf } from '../format'

const props = defineProps<{ reading: PowerDeviceReading }>()

const state = computed(() => {
  const reading = props.reading
  if (reading.status === 'absent') return 'absent'
  if (reading.percent === null) return 'unsupported'
  if (reading.stale) return 'stale'
  if (reading.charging === true) return 'charging'
  if (reading.percent <= 20) return 'low'
  return 'ok'
})

const title = computed(() => [props.reading.brand, props.reading.name].filter(Boolean).join(' '))

const meta = computed(() => {
  const reading = props.reading
  if (reading.percent === null) return reading.note ?? '暂无读数'
  const time = timeOf(reading.updatedAt)
  const parts = [LINK_LABEL[reading.link]]
  if (reading.model) parts.push(reading.model)
  if (time) parts.push(reading.stale ? `上次 ${time}` : time)
  return parts.join(' · ')
})
</script>

<template>
  <li class="device" :data-state="state">
    <span class="device__glyph" aria-hidden="true">
      <svg
        v-if="reading.kind === 'keyboard'"
        width="17"
        height="17"
        viewBox="0 0 17 17"
        fill="none"
        stroke="currentColor"
        stroke-width="1.2"
        stroke-linecap="round"
      >
        <rect x="1.9" y="4.6" width="13.2" height="7.8" rx="1.8" />
        <path d="M4.6 7.3h.7M7.2 7.3h.7M9.8 7.3h.7M12.4 7.3h.1M4.9 10h7.2" />
      </svg>
      <svg
        v-else-if="reading.kind === 'mouse'"
        width="17"
        height="17"
        viewBox="0 0 17 17"
        fill="none"
        stroke="currentColor"
        stroke-width="1.2"
        stroke-linecap="round"
      >
        <rect x="4.1" y="2" width="8.8" height="13" rx="4.4" />
        <path d="M8.5 4.9v2.6" />
      </svg>
      <svg
        v-else
        width="17"
        height="17"
        viewBox="0 0 17 17"
        fill="none"
        stroke="currentColor"
        stroke-width="1.2"
        stroke-linecap="round"
      >
        <rect x="2.6" y="5.9" width="9" height="6.6" rx="1.8" />
        <path d="M11.6 8h2.8v2.4h-2.8" />
      </svg>
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
