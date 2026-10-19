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
