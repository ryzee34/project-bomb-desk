import { SPIN_MS } from '../game/rules'

export interface Spin {
  times: number[]
  wires: number[]
}

export function planSpin(remaining: number[], target: number): Spin {
  const steps = 16 + Math.floor(Math.random() * 6)
  const start = Math.floor(Math.random() * remaining.length)
  const wires: number[] = []
  for (let s = 0; s < steps; s++) wires.push(remaining[(start + s) % remaining.length]!)
  while (wires[wires.length - 1] !== target) wires.push(remaining[(remaining.indexOf(wires[wires.length - 1]!) + 1) % remaining.length]!)
  const gaps = wires.map((_, s) => 60 + (s / wires.length) ** 2 * 420)
  const scale = SPIN_MS / gaps.reduce((a, b) => a + b, 0)
  const times: number[] = []
  let at = 0
  for (const gap of gaps) {
    times.push(at)
    at += gap * scale
  }
  return { times, wires }
}

export function spinStep(spin: Spin, elapsed: number) {
  let step = -1
  while (step + 1 < spin.times.length && spin.times[step + 1]! <= elapsed) step++
  return step
}
