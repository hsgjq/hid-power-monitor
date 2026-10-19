<script setup lang="ts">
import { computed } from 'vue'

/*
 * 电量条。颜色只表达"低电 / 充电 / 正常"，读数作不作数用 data-stale 单独表达，
 * 这样充电时既能是绿的又能是暗的。
 */

const props = defineProps<{
  percent: number | null
  charging: boolean | null
  stale: boolean
}>()

const tone = computed(() => {
  if (props.percent === null) return 'unknown'
  if (props.charging === true) return 'charge'
  if (props.percent <= 20) return 'low'
  return 'normal'
})

// 有读数时至少留出可见的一格，不然 1% 会画成一条看不见的缝
const width = computed(() => `${props.percent === null ? 0 : Math.max(3, props.percent)}%`)
</script>

<template>
  <span class="battery" :data-tone="tone" :data-stale="stale ? 'true' : 'false'">
    <span class="battery__fill" :style="{ width }"></span>
  </span>
</template>
