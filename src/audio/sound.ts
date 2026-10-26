let ac: AudioContext | null = null
let master: GainNode
let drone: GainNode
let noise: AudioBuffer

const DRONE = 0.16
const rand = (min: number, max: number) => min + Math.random() * (max - min)

export function startAudio() {
  if (ac) {
    ac.resume()
    return
  }
  ac = new AudioContext()
  master = ac.createGain()
  master.gain.value = 0.9
  const compressor = ac.createDynamicsCompressor()
  master.connect(compressor).connect(ac.destination)

  noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate)
  const white = noise.getChannelData(0)
  for (let i = 0; i < white.length; i++) white[i] = Math.random() * 2 - 1

  const brown = ac.createBuffer(1, ac.sampleRate * 4, ac.sampleRate)
  const data = brown.getChannelData(0)
  let last = 0
  for (let i = 0; i < data.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02
    data[i] = last * 3.5
  }
  const rumble = ac.createBufferSource()
  rumble.buffer = brown
  rumble.loop = true
  const lowpass = ac.createBiquadFilter()
  lowpass.type = 'lowpass'
  lowpass.frequency.value = 240
  drone = ac.createGain()
  drone.gain.value = DRONE
  rumble.connect(lowpass).connect(drone).connect(master)
  rumble.start()
  for (const [freq, gain] of [[60, 0.014], [120, 0.007]] as const) {
    const hum = ac.createOscillator()
    hum.frequency.value = freq
    const level = ac.createGain()
    level.gain.value = gain
    hum.connect(level).connect(drone)
    hum.start()
  }
  ac.resume()
}

interface Burst {
  dur: number
  type: BiquadFilterType
  freq: number
  q?: number
  gain: number
  attack?: number
  when?: number
  sweepTo?: number
}

function burst({ dur, type, freq, q = 1, gain, attack = 0.002, when = 0, sweepTo }: Burst) {
  if (!ac) return
  const t = ac.currentTime + when
  const src = ac.createBufferSource()
  src.buffer = noise
  const filter = ac.createBiquadFilter()
  filter.type = type
  filter.frequency.setValueAtTime(freq, t)
  if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, t + dur)
  filter.Q.value = q
  const env = ac.createGain()
  env.gain.setValueAtTime(0.0001, t)
  env.gain.exponentialRampToValueAtTime(gain, t + attack)
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(filter).connect(env).connect(master)
  src.start(t, Math.random())
  src.stop(t + dur + 0.05)
}

interface Tone {
  freq: number
  dur: number
  type?: OscillatorType
  gain: number
  when?: number
  attack?: number
  slideTo?: number
}

function tone({ freq, dur, type = 'sine', gain, when = 0, attack = 0.004, slideTo }: Tone) {
  if (!ac) return
  const t = ac.currentTime + when
  const osc = ac.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur)
  const env = ac.createGain()
  env.gain.setValueAtTime(0.0001, t)
  env.gain.exponentialRampToValueAtTime(gain, t + attack)
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(env).connect(master)
  osc.start(t)
  osc.stop(t + dur + 0.05)
}

export const sfx = {
  key() {
    burst({ dur: 0.05, type: 'bandpass', freq: rand(1500, 2100), q: 0.9, gain: 0.22 })
    tone({ freq: rand(105, 125), dur: 0.06, gain: 0.12 })
    burst({ dur: 0.014, type: 'highpass', freq: 4200, gain: 0.05 })
  },
  slip() {
    tone({ freq: 72, dur: 0.2, type: 'square', gain: 0.07 })
    burst({ dur: 0.14, type: 'lowpass', freq: 520, gain: 0.2 })
  },
  tick(loud: boolean) {
    burst({ dur: 0.012, type: 'highpass', freq: 3600, gain: loud ? 0.1 : 0.035 })
  },
  beat(level: number) {
    tone({ freq: 54, dur: 0.14, gain: 0.3 * level, attack: 0.01 })
    burst({ dur: 0.1, type: 'lowpass', freq: 130, gain: 0.28 * level })
    tone({ freq: 45, dur: 0.17, gain: 0.22 * level, when: 0.2, attack: 0.01 })
  },
  roll() {
    burst({ dur: 0.022, type: 'bandpass', freq: 2600, q: 3, gain: 0.14 })
    tone({ freq: 880, dur: 0.03, type: 'triangle', gain: 0.03 })
  },
  snip() {
    burst({ dur: 0.05, type: 'highpass', freq: 2200, gain: 0.4 })
    tone({ freq: 2600, dur: 0.08, type: 'triangle', gain: 0.05 })
    tone({ freq: 3400, dur: 0.06, type: 'triangle', gain: 0.035, when: 0.012 })
  },
  relief() {
    burst({ dur: 1.1, type: 'bandpass', freq: 650, q: 0.6, gain: 0.09, attack: 0.3 })
  },
  boom() {
    burst({ dur: 2.6, type: 'lowpass', freq: 1200, sweepTo: 50, gain: 1, attack: 0.004 })
    tone({ freq: 48, dur: 2.2, gain: 0.7, slideTo: 26 })
    tone({ freq: 3900, dur: 4.5, gain: 0.025, when: 0.35, attack: 0.4 })
  },
  thump() {
    burst({ dur: 0.7, type: 'lowpass', freq: 150, gain: 0.32 })
    tone({ freq: 42, dur: 0.55, gain: 0.16 })
  },
  duck(level: number, seconds: number) {
    if (!ac) return
    drone.gain.cancelScheduledValues(ac.currentTime)
    drone.gain.setTargetAtTime(level * DRONE, ac.currentTime, seconds)
  },
}
