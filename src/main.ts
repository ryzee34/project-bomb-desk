import './style.css'
import { advance, createRoom, currentLine, deskById, press, wiresLeft, type Room, type RoomEvent } from './game/room'
import { SPIN_MS, WIRES, WIRE_NAMES, YOUR_DESK } from './game/rules'
import { createDeskScene } from './scene/desk'
import { planSpin, spinStep, type Spin } from './scene/spin'
import { paintGrain } from './ui/film'
import { flashWhite, hurt, renderHud, setStatus } from './ui/hud'
import { createStrip } from './ui/strip'

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

paintGrain($('#grain'))
const desk = createDeskScene($('#scene'), reduced)
const strip = createStrip($('#strip'))

let room: Room = createRoom(Date.now(), [YOUR_DESK])
let playing = false
let shownDisplay = ''
let statusTimer = 0
let spin: Spin | null = null
let spinShown = -1

const you = () => deskById(room, YOUR_DESK)
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function flashStatus(text: string, ms = 2200) {
  setStatus(text)
  clearTimeout(statusTimer)
  statusTimer = window.setTimeout(() => setStatus(''), ms)
}

function refresh() {
  const me = you()
  const seconds = Math.ceil(me.lineLeft / 1000)
  renderHud({ round: room.round, line: Math.min(me.lineIdx + 1, room.lines.length), seconds, slips: me.slips, wires: wiresLeft(me) })
  desk.setSlips(me.slips)
  const display = `${seconds}/${wiresLeft(me)}`
  if (display !== shownDisplay) {
    shownDisplay = display
    desk.setDisplay(seconds, wiresLeft(me))
  }
  strip.show(currentLine(room, me), me.pos)
  if (room.phase === 'break') $('#breakCount').textContent = `Round ${room.round + 1} in ${Math.max(1, Math.ceil(room.breakLeft / 1000))}`
}

function showSpin() {
  const roll = you().roll
  if (!spin || !roll) return
  const step = spinStep(spin, roll.elapsed)
  if (step !== spinShown && step >= 0) {
    spinShown = step
    desk.litWire(spin.wires[step]!)
  }
  if (roll.elapsed >= SPIN_MS) setStatus('')
}

async function explode(wire: number) {
  playing = false
  desk.litWire(null)
  desk.shake(0.08)
  desk.blackout()
  strip.dim(false)
  $('#strip').hidden = true
  await flashWhite()
  await sleep(1900)
  const lines = you().linesTyped
  $('#deadText').textContent = `You got through ${plural(lines, 'line')} before the device found the ${WIRE_NAMES[wire]} wire. It was live the whole time.`
  $('#dead').hidden = false
  $('#again').focus()
}

function handle(events: RoomEvent[]) {
  for (const event of events) {
    if ('desk' in event && event.desk !== YOUR_DESK) continue
    switch (event.type) {
      case 'slip':
        hurt()
        desk.shake(0.012)
        strip.shake()
        strip.show(currentLine(room, you()), you().pos, true)
        setTimeout(() => !you().roll && strip.show(currentLine(room, you()), you().pos), 220)
        break
      case 'roll': {
        const remaining = Array.from({ length: WIRES }, (_, i) => i).filter(i => !you().cut.includes(i))
        spin = planSpin(remaining, event.wire)
        spinShown = -1
        strip.dim(true)
        desk.setDread(true)
        setStatus(event.reason === 'time' ? 'Time ran out. The device is choosing a wire.' : 'Three slips. The device is choosing a wire.')
        break
      }
      case 'cut':
        spin = null
        desk.litWire(null)
        desk.cutWire(event.wire)
        desk.setDread(false)
        strip.dim(false)
        flashStatus(`The ${WIRE_NAMES[event.wire]} wire. Keep typing.`)
        break
      case 'out':
        spin = null
        explode(event.wire)
        break
      case 'break': {
        const left = wiresLeft(you())
        $('#breakEyebrow').textContent = `Round ${event.round}`
        $('#breakText').textContent = `Your device has ${plural(left, 'wire')} left, so the next cut is 1 in ${left}.`
        $('#break').hidden = false
        break
      }
      case 'round':
        $('#break').hidden = true
        break
    }
  }
  refresh()
}

addEventListener('keydown', e => {
  if (!playing) return
  if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
  if (e.key.length !== 1) return
  e.preventDefault()
  desk.pressKey(e.key)
  handle(press(room, YOUR_DESK, e.key))
})

let last = performance.now()
setInterval(() => {
  const now = performance.now()
  const ms = now - last
  last = now
  if (!playing) return
  handle(advance(room, ms))
  showSpin()
}, 20)

function heartbeat() {
  const me = you()
  const rolling = playing && me.roll ? 1 : 0
  const slips = playing ? me.slips : 0
  const low = playing && me.lineLeft <= 10_000 ? 1 : 0
  desk.setNerves(1 + slips * 0.35 + rolling * 0.8)
  if (playing || room.phase !== 'over') desk.beat()
  setTimeout(heartbeat, 60000 / (64 + slips * 16 + rolling * 48 + low * 18))
}

function sitDown() {
  room = createRoom(Date.now(), [YOUR_DESK])
  spin = null
  desk.resetWires()
  desk.relight()
  desk.setDread(false)
  strip.dim(false)
  $('#strip').hidden = false
  setStatus('')
  playing = true
  last = performance.now()
  refresh()
}

$('#start').addEventListener('click', () => {
  $('#intro').hidden = true
  $('#start').blur()
  sitDown()
})

$('#again').addEventListener('click', () => {
  $('#dead').hidden = true
  $('#again').blur()
  sitDown()
})

refresh()
document.fonts.ready.then(() => desk.setDisplay(Math.ceil(you().lineLeft / 1000), wiresLeft(you())))
heartbeat()
