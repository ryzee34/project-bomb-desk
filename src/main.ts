import './style.css'
import { sfx, startAudio } from './audio/sound'
import { driveBots, makeBots, type Bots } from './game/bots'
import { advance, alive, createRoom, currentLine, deskById, press, wiresLeft, type Room, type RoomEvent } from './game/room'
import { DESKS, SPIN_MS, WIRES, WIRE_NAMES, YOUR_DESK } from './game/rules'
import { createDeskScene } from './scene/desk'
import { planSpin, spinStep, type Spin } from './scene/spin'
import { paintGrain } from './ui/film'
import { flashWhite, hurt, renderHud, setStatus } from './ui/hud'
import { createRoomPanel } from './ui/room-panel'
import { createStrip } from './ui/strip'

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const BOT_DESKS = DESKS.filter(id => id !== YOUR_DESK)

paintGrain($('#grain'))
const desk = createDeskScene($('#scene'), reduced)
const strip = createStrip($('#strip'))
const panel = createRoomPanel($('#room'))

let room: Room = createRoom(Date.now(), DESKS)
let bots: Bots = makeBots(Date.now(), BOT_DESKS)
let seated = false
let shownDisplay = ''
let shownSeconds = -1
let statusTimer = 0
let spin: Spin | null = null
let spinShown = -1

const you = () => deskById(room, YOUR_DESK)
const playing = () => seated && !you().out && room.phase !== 'over'
const calm = () => playing() && !you().roll
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const ordinal = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] ?? 'th'}`

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
  if (playing() && room.phase === 'typing' && !me.roll && seconds < shownSeconds) sfx.tick(seconds <= 10)
  shownSeconds = seconds
  const display = `${seconds}/${wiresLeft(me)}`
  if (display !== shownDisplay) {
    shownDisplay = display
    desk.setDisplay(seconds, wiresLeft(me))
  }
  const waiting = alive(room).filter(d => !d.done).length
  if (playing() && me.done && room.phase === 'typing' && !me.roll && waiting) strip.note(`Round done. Waiting on ${plural(waiting, 'desk')}.`)
  else strip.show(currentLine(room, me), me.pos)
  if (room.phase === 'break') $('#breakCount').textContent = `Round ${room.round + 1} in ${Math.max(1, Math.ceil(room.breakLeft / 1000))}`
  if (me.out) {
    const left = alive(room).length
    $('#deadRoom').textContent = room.phase === 'over' && room.winner ? `Desk ${room.winner} was the last desk lit.` : `${plural(left, 'desk')} still lit.`
  }
  panel.render(room)
}

function showSpin() {
  const roll = you().roll
  if (!spin || !roll) return
  const step = spinStep(spin, roll.elapsed)
  if (step !== spinShown && step >= 0) {
    spinShown = step
    desk.litWire(spin.wires[step]!)
    sfx.roll()
  }
  if (roll.elapsed >= SPIN_MS) setStatus('')
}

function clearRoll() {
  spin = null
  desk.litWire(null)
  desk.setDread(false)
  strip.dim(false)
}

async function explode(wire: number, place: number) {
  sfx.snip()
  sfx.boom()
  sfx.duck(0, 0.05)
  spin = null
  desk.litWire(null)
  desk.shake(0.08)
  desk.blackout()
  strip.dim(false)
  setStatus('')
  $('#strip').hidden = true
  $('#break').hidden = true
  await flashWhite()
  await sleep(1900)
  const lines = you().linesTyped
  $('#deadText').textContent = `You got through ${plural(lines, 'line')} before the device found the ${WIRE_NAMES[wire]} wire. It was live the whole time. You went dark ${ordinal(place)} of ${DESKS.length}.`
  $('#dead').hidden = false
  $('#again').focus()
}

function win() {
  clearRoll()
  sfx.duck(1, 1.2)
  sfx.relief()
  setStatus('')
  $('#break').hidden = true
  $('#wonText').textContent = `You outlasted ${plural(DESKS.length - 1, 'desk')} over ${plural(room.round, 'round')}, with ${plural(wiresLeft(you()), 'wire')} still on your device.`
  $('#won').hidden = false
  $('#replay').focus()
}

function distantDesk(event: RoomEvent) {
  if (!('desk' in event)) return
  const name = `Desk ${event.desk}`
  if (event.type === 'out') {
    setTimeout(() => {
      sfx.thump()
      desk.flicker(0.35)
      desk.shake(0.004)
      if (calm()) flashStatus(`${name} went dark.`)
    }, Math.random() * 500)
  }
  if (event.type === 'roll' && event.reason === 'last' && calm()) setStatus(`${name} finished last. Its device is choosing a wire.`)
  if (event.type === 'cut' && deskById(room, event.desk).done && room.lastCut && calm()) flashStatus(`${name} kept its light.`)
}

function handle(events: RoomEvent[]) {
  for (const event of events) {
    if ('desk' in event && event.desk !== YOUR_DESK) {
      distantDesk(event)
      continue
    }
    switch (event.type) {
      case 'slip':
        sfx.slip()
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
        sfx.duck(0.25, 0.4)
        clearTimeout(statusTimer)
        setStatus(
          event.reason === 'time'
            ? 'Time ran out. The device is choosing a wire.'
            : event.reason === 'last'
              ? 'You finished last. The device is choosing a wire.'
              : 'Three slips. The device is choosing a wire.',
        )
        break
      }
      case 'cut':
        clearRoll()
        sfx.snip()
        setTimeout(() => sfx.relief(), 250)
        sfx.duck(1, 1.2)
        desk.cutWire(event.wire)
        flashStatus(`The ${WIRE_NAMES[event.wire]} wire. ${you().done ? 'Still lit.' : 'Keep typing.'}`)
        break
      case 'out':
        explode(event.wire, event.place)
        break
      case 'break': {
        if (you().out) break
        const left = wiresLeft(you())
        const others = alive(room).length - 1
        $('#breakEyebrow').textContent = `Round ${event.round}`
        $('#breakText').textContent = `${others} of ${DESKS.length - 1} other desks are still lit. Your device has ${plural(left, 'wire')} left, so the next cut is 1 in ${left}.`
        $('#break').hidden = false
        break
      }
      case 'round':
        $('#break').hidden = true
        break
      case 'over':
        if (event.winner === YOUR_DESK) win()
        break
    }
  }
  refresh()
}

addEventListener('keydown', e => {
  if (!playing()) return
  if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
  if (e.key.length !== 1) return
  e.preventDefault()
  desk.pressKey(e.key)
  const events = press(room, YOUR_DESK, e.key)
  if (events.length) sfx.key()
  handle(events)
})

let last = performance.now()
setInterval(() => {
  const now = performance.now()
  const ms = now - last
  last = now
  if (!seated || room.phase === 'over') return
  handle([...driveBots(room, bots, ms), ...advance(room, ms)])
  showSpin()
}, 20)

function heartbeat() {
  const me = you()
  const on = playing()
  const rolling = on && me.roll ? 1 : 0
  const slips = on ? me.slips : 0
  const low = on && me.lineLeft <= 10_000 ? 1 : 0
  desk.setNerves(1 + slips * 0.35 + rolling * 0.8)
  desk.beat()
  if (on) sfx.beat(Math.min(0.45 + slips * 0.18 + rolling * 0.5, 1.2))
  setTimeout(heartbeat, 60000 / (64 + slips * 16 + rolling * 48 + low * 18))
}

function sitDown() {
  const seed = Date.now()
  room = createRoom(seed, DESKS)
  bots = makeBots(seed, BOT_DESKS)
  clearRoll()
  desk.resetWires()
  desk.relight()
  $('#strip').hidden = false
  setStatus('')
  sfx.duck(1, 0.6)
  seated = true
  last = performance.now()
  refresh()
}

for (const [card, button] of [['#intro', '#start'], ['#dead', '#again'], ['#won', '#replay']] as const) {
  $(button).addEventListener('click', () => {
    startAudio()
    $(card).hidden = true
    $(button).blur()
    sitDown()
  })
}

refresh()
document.fonts.ready.then(() => desk.setDisplay(Math.ceil(you().lineLeft / 1000), wiresLeft(you())))
heartbeat()
