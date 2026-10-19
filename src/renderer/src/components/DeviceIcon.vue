<script setup lang="ts">
import type { PowerDeviceReading } from '@shared/types'

/*
 * 设备图标。浮条和设备行都要用，所以单独抽出来一份，避免两处各画一套后走形。
 * 线条图标统一 1.2 描边、currentColor 取父级颜色，暗底上靠父级色控制强弱。
 */

defineProps<{ kind: PowerDeviceReading['kind']; size?: number }>()
</script>

<template>
  <svg
    v-if="kind === 'keyboard'"
    :width="size ?? 17"
    :height="size ?? 17"
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
    v-else-if="kind === 'mouse'"
    :width="size ?? 17"
    :height="size ?? 17"
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
    :width="size ?? 17"
    :height="size ?? 17"
    viewBox="0 0 17 17"
    fill="none"
    stroke="currentColor"
    stroke-width="1.2"
    stroke-linecap="round"
  >
    <rect x="2.6" y="5.9" width="9" height="6.6" rx="1.8" />
    <path d="M11.6 8h2.8v2.4h-2.8" />
  </svg>
</template>
