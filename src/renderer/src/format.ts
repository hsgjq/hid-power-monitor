import type { DeviceLink } from '@shared/types'

/*
 * 界面文案的取值表。时间用本地时区显示（读数时间戳是 ISO，比较也是本地），
 * 无效时间戳返回 null 让调用方省略这一段，而不是显示 "NaN:NaN"。
 */

export const LINK_LABEL: Record<DeviceLink, string> = {
  '2.4g': '2.4G',
  wired: '有线',
  unknown: '连接方式未知'
}

export function timeOf(iso: string | null): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}
