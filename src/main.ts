import './style.css'
import { advance, createRoom, currentLine, deskById, press, type Room, type RoomEvent } from './game/room'
import { YOUR_DESK } from './game/rules'
import { createDeskScene } from './scene/desk'
import { paintGrain } from './ui/film'
import { hurt, renderHud, setStatus } from './ui/hud'
import { createStrip } from './ui/strip'

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

paintGrain($('#grain'))
const desk = createDeskScene($('#scene'), reduced)
const strip = createStrip($('#strip'))

let room: Room = createRoom(Date.now(), [YOUR_DESK])
let playing = false
let shownSeconds = -1
let statusTimer = 0

const you = () => deskById(room, YOUR_DESK)

function flashStatus(text: string, ms = 2200) {
  setStatus(text)
  clearTimeout(statusTimer)
  statusTimer = window.setTimeout(() => setStatus(''), ms)
}

function refresh() {
  const me = you()
  const seconds = Math.ceil(me.lineLeft / 1000)
  renderHud({ round: room.round, line: Math.min(me.lineIdx + 1, room.lines.length), seconds })
  if (seconds !== shownSeconds) {
    shownSeconds = seconds
    desk.setDisplay(seconds, 6)
  }
  strip.show(currentLine(room, me), me.pos)
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
        setTimeout(() => strip.show(currentLine(room, you()), you().pos), 220)
        break
      case 'timeout':
        flashStatus('Time ran out.')
        break
      case 'round':
        flashStatus(`Round ${event.round}.`)
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
  if (playing) handle(advance(room, ms))
}, 50)

$('#start').addEventListener('click', () => {
  $('#intro').hidden = true
  $('#start').blur()
  room = createRoom(Date.now(), [YOUR_DESK])
  playing = true
  last = performance.now()
  refresh()
})

refresh()
document.fonts.ready.then(() => desk.setDisplay(Math.ceil(you().lineLeft / 1000), 6))
setInterval(() => desk.beat(), 60000 / 64)
