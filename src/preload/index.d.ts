import type { PowerBridge } from '../shared/types'

declare global {
  interface Window {
    power: PowerBridge
  }
}

export {}
