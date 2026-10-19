/*
 * 低电量提示音。Electron 的 Notification 在 Windows 上不能指定声音，所以主进程发
 * power:alert 事件，由这里用 Web Audio 合成两声短蜂鸣。AudioContext 做成单例：
 * 同一页面能创建的实例有上限（实测约 6 个），每次提醒都新建会直接失败。
 * 面板平时是隐藏窗口，主进程那边给它关了后台节流，声音才会在没人打开面板时响。
 */

let context: AudioContext | null = null

function ensureContext(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null
  if (!context) context = new AudioContext()
  if (context.state === 'suspended') void context.resume()
  return context
}

function chirp(ctx: AudioContext, at: number, frequency: number, duration: number): void {
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()
  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(frequency, at)
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(0.16, at + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration)
  oscillator.connect(gain)
  gain.connect(ctx.destination)
  oscillator.start(at)
  oscillator.stop(at + duration + 0.02)
}

export function playLowBatteryChime(): void {
  const ctx = ensureContext()
  if (!ctx) return
  const now = ctx.currentTime
  chirp(ctx, now, 880, 0.14)
  chirp(ctx, now + 0.2, 1175, 0.18)
}
