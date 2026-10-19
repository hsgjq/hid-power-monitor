<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { AppSettings, HidDiagnostics } from '@shared/types'
import { playLowBatteryChime } from '../alert-sound'

/*
 * 设置项。控件全是原生 checkbox / button / details 加样式，没有自绘：开关是
 * appearance:none 的 checkbox 配 role="switch"，保留空格切换和 focus-visible 描边。
 * 阈值 0 表示整条提醒关闭，此时提示音那一行直接不渲染，不留一个按了没反应的死控件。
 * 打开提示音时立刻响一声，作为"这功能生效了"的即时反馈。
 *
 * 诊断清单要枚举全部 HID 接口，比读两块电池贵，所以折叠起来按需加载，
 * 展开时才取；列表内部滚动，避免把托盘面板顶成一条通屏高。
 */

const STEP = 5
const MAX = 50

const settings = ref<AppSettings | null>(null)
const loginItemSupported = ref(true)
const diagnostics = ref<HidDiagnostics | null>(null)
const copied = ref(false)

async function save(patch: Partial<AppSettings>): Promise<void> {
  settings.value = await window.power.saveSettings(patch)
}

function onToggle(event: Event): void {
  void save({ autoLaunch: (event.target as HTMLInputElement).checked })
}

function autoLaunchHint(): string {
  // 未打包时写注册表只会留下一条指向 electron.exe、不带项目路径的坏记录
  return loginItemSupported.value ? '登录后自动在托盘运行' : '打包成 exe 后此项才生效'
}

function step(delta: number): void {
  if (!settings.value) return
  const next = Math.min(MAX, Math.max(0, settings.value.lowBatteryPercent + delta))
  if (next !== settings.value.lowBatteryPercent) void save({ lowBatteryPercent: next })
}

async function onSoundToggle(event: Event): Promise<void> {
  const enabled = (event.target as HTMLInputElement).checked
  settings.value = await window.power.saveSettings({ soundAlert: enabled })
  if (enabled) playLowBatteryChime()
}

async function onStripToggle(event: Event): Promise<void> {
  const enabled = (event.target as HTMLInputElement).checked
  settings.value = await window.power.saveSettings({ stripVisible: enabled })
}

async function onColorPick(event: Event): Promise<void> {
  settings.value = await window.power.saveSettings({
    stripTextColor: (event.target as HTMLInputElement).value
  })
}

async function resetColor(): Promise<void> {
  settings.value = await window.power.saveSettings({ stripTextColor: null })
}

async function onDiagToggle(event: Event): Promise<void> {
  const details = event.target as HTMLDetailsElement
  if (details.open && !diagnostics.value) diagnostics.value = await window.power.getDiagnostics()
  copied.value = false
}

function plainLines(): string[] {
  if (!diagnostics.value) return []
  return diagnostics.value.groups.map((group) => {
    const name = [group.manufacturer, group.product].filter(Boolean).join(' ')
    const pages = group.collections
      .map((item) => `${item.usagePage ?? '-'}/${item.usage ?? '-'} ${item.kind}`)
      .join(', ')
    return `${group.id}  ${name}\n  ${group.reason}｜${group.interfaceCount} 个集合｜${pages}`
  })
}

function copyDiagnostics(): void {
  if (!diagnostics.value) return
  const header = `HID 设备清单 ${new Date(diagnostics.value.generatedAt).toLocaleString()}`
  window.power.copyText([header, ...plainLines()].join('\n'))
  copied.value = true
}

onMounted(async () => {
  const [next, flags] = await Promise.all([
    window.power.getSettings(),
    window.power.getRuntimeFlags()
  ])
  settings.value = next
  loginItemSupported.value = flags.loginItemSupported
})
</script>

<template>
  <ul v-if="settings" class="settings">
    <li class="setting">
      <div>
        <p class="setting__label">开机自启</p>
        <p class="setting__hint">{{ autoLaunchHint() }}</p>
      </div>
      <input
        class="switch"
        type="checkbox"
        role="switch"
        :checked="settings.autoLaunch"
        :disabled="!loginItemSupported"
        aria-label="开机自启"
        @change="onToggle"
      />
    </li>

    <li class="setting">
      <div>
        <p class="setting__label">低电量提醒</p>
        <p class="setting__hint">低于该值时弹通知，并把读数标红</p>
      </div>
      <div class="stepper">
        <button
          class="stepper__btn"
          type="button"
          aria-label="降低阈值"
          :disabled="settings.lowBatteryPercent <= 0"
          @click="step(-STEP)"
        >
          &minus;
        </button>
        <span class="stepper__value">
          {{ settings.lowBatteryPercent === 0 ? '关闭' : `${settings.lowBatteryPercent}%` }}
        </span>
        <button
          class="stepper__btn"
          type="button"
          aria-label="提高阈值"
          :disabled="settings.lowBatteryPercent >= MAX"
          @click="step(STEP)"
        >
          +
        </button>
      </div>
    </li>

    <li v-if="settings.lowBatteryPercent > 0" class="setting">
      <div>
        <p class="setting__label">低电量提示音</p>
        <p class="setting__hint">打开时会先响一声给你听</p>
      </div>
      <input
        class="switch"
        type="checkbox"
        role="switch"
        :checked="settings.soundAlert"
        aria-label="低电量提示音"
        @change="onSoundToggle"
      />
    </li>

    <li class="setting">
      <div>
        <p class="setting__label">桌面浮条</p>
        <p class="setting__hint">在屏幕上常驻一条电量，可拖动</p>
      </div>
      <input
        class="switch"
        type="checkbox"
        role="switch"
        :checked="settings.stripVisible"
        aria-label="桌面浮条"
        @change="onStripToggle"
      />
    </li>

    <li v-if="settings.stripVisible" class="setting">
      <div>
        <p class="setting__label">浮条文字颜色</p>
        <p class="setting__hint">低电与充电会另显示图标</p>
      </div>
      <div class="setting__side">
        <button
          v-if="settings.stripTextColor"
          class="action"
          type="button"
          @click="resetColor"
        >
          默认
        </button>
        <input
          class="swatch"
          type="color"
          :value="settings.stripTextColor ?? '#e8eaed'"
          aria-label="浮条文字颜色"
          @change="onColorPick"
        />
      </div>
    </li>

    <li class="setting setting--wide">
      <details class="diag" @toggle="onDiagToggle">
        <summary class="diag__summary">
          <span>检测到的 HID 设备</span>
          <span v-if="diagnostics" class="diag__count">{{ diagnostics.groups.length }}</span>
        </summary>
        <div v-if="diagnostics" class="diag__body">
          <ul class="diag__list">
            <li
              v-for="group in diagnostics.groups"
              :key="group.id"
              class="diag__item"
              :data-shown="group.shown ? 'true' : 'false'"
            >
              <p class="diag__id">
                {{ group.id }}
                <span class="diag__name">{{
                  [group.manufacturer, group.product].filter(Boolean).join(' ') || '（无产品串）'
                }}</span>
              </p>
              <p class="diag__reason">
                {{ group.reason }} · {{ group.interfaceCount }} 个集合 ·
                {{ group.collections.map((item) => item.usagePage).join(' ') }}
              </p>
            </li>
          </ul>
          <button class="action diag__copy" type="button" @click="copyDiagnostics">
            {{ copied ? '已复制' : '复制清单' }}
          </button>
        </div>
      </details>
    </li>
  </ul>
</template>
