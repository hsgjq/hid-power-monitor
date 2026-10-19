<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  percent: number | null
  charging: boolean | null
  stale: boolean
}>()

const tone = computed(() => {
  if (props.percent === null) return 'unknown'
  if (props.stale) return 'stale'
  if (props.charging === true) return 'charge'
  if (props.percent <= 20) return 'low'
  return 'normal'
})

const width = computed(() => `${props.percent === null ? 0 : Math.max(3, props.percent)}%`)
</script>

<template>
  <span class="battery" :data-tone="tone">
    <span class="battery__fill" :style="{ width }"></span>
  </span>
</template>
