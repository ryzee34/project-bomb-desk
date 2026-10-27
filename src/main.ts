import './style.css'
import { sfx, startAudio } from './audio/sound'
import { alive, currentLine, deskById, wiresLeft, type RoomEvent } from './game/room'
import { DESKS, MIN_DESKS, SPIN_MS, WIRES, WIRE_NAMES } from './game/rules'
import { newCode, playerId, roomFromUrl, roomLink, setRoomInUrl } from './play/codes'
import { localPlay } from './play/local'
import type { Play } from './play/play'
import { joinRoom, type Lobby, type Table } from './play/remote'
import { createDeskScene } from './scene/desk'
import { planSpin, spinStep, type Spin } from './scene/spin'
import { paintGrain } from './ui/film'
import { flashWhite, hurt, renderHud, setStatus } from './ui/hud'
import { createRoomPanel } from './ui/room-panel'
import { createStrip } from './ui/strip'

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const ROOMS_URL = import.meta.env.VITE_ROOMS_URL ?? 'ws://127.0.0.1:8787'
const CARDS = ['#intro', '#lobby', '#dead', '#break', '#won']

paintGrain($('#grain'))
const scene = createDeskScene($('#scene'), reduced)
const strip = createStrip($('#strip'))
const panel = createRoomPanel($('#room'))

let play: Play = localPlay(Date.now())
let live = false
let code = roomFromUrl()
let table: Table | null = null
let lobby: Lobby = { host: false, people: 0, playing: false }
let bots: number | null = null
let shownDisplay = ''
let shownSeconds = -1
let statusTimer = 0
let spin: Spin | null = null
let spinShown = -1

const me = () => (play.you === null ? null : deskById(play.room, play.you))
const playing = () => {
  const desk = me()
  return live && !!desk && !desk.out && play.room.phase !== 'over'
}
const calm = () => playing() && !me()!.roll
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const openDesks = () => DESKS.length - Math.min(lobby.people, DESKS.length)
const botCount = () => Math.min(bots ?? openDesks(), openDesks())
const ordinal = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] ?? 'th'}`

function show(card: string | null) {
  for (const id of CARDS) $(id).hidden = id !== card
}

function flashStatus(text: string, ms = 2200) {
  setStatus(text)
  clearTimeout(statusTimer)
  statusTimer = window.setTimeout(() => setStatus(''), ms)
}

function refresh() {
  const room = play.room
  panel.render(room, play.you, play.humans)
  if (room.phase === 'break') $('#breakCount').textContent = `Round ${room.round + 1} in ${Math.max(1, Math.ceil(room.breakLeft / 1000))}`
  const desk = me()
  if (!desk) return
  const seconds = Math.ceil(desk.lineLeft / 1000)
  renderHud({ round: room.round, line: Math.min(desk.lineIdx + 1, room.lines.length), seconds, slips: desk.slips, wires: wiresLeft(desk) })
  scene.setSlips(desk.slips)
  if (playing() && room.phase === 'typing' && !desk.roll && seconds < shownSeconds) sfx.tick(seconds <= 10)
  shownSeconds = seconds
  const display = `${seconds}/${wiresLeft(desk)}`
  if (display !== shownDisplay) {
    shownDisplay = display
    scene.setDisplay(seconds, wiresLeft(desk))
  }
  const waiting = alive(room).filter(d => !d.done).length
  if (playing() && desk.done && room.phase === 'typing' && !desk.roll && waiting) strip.note(`Round done. Waiting on ${plural(waiting, 'desk')}.`)
  else strip.show(currentLine(room, desk), desk.pos)
  if (desk.out) {
    const left = alive(room).length
    $('#deadRoom').textContent = room.phase === 'over' && room.winner ? `Desk ${room.winner} was the last desk lit.` : `${plural(left, 'desk')} still lit.`
  }
}

function showSpin() {
  const roll = me()?.roll
  if (!spin || !roll) return
  const step = spinStep(spin, roll.elapsed)
  if (step !== spinShown && step >= 0) {
    spinShown = step
    scene.litWire(spin.wires[step]!)
    sfx.roll()
  }
  if (roll.elapsed >= SPIN_MS) setStatus('')
}

function clearRoll() {
  spin = null
  scene.litWire(null)
  scene.setDread(false)
  strip.dim(false)
}

async function explode(wire: number, place: number) {
  const game = play
  sfx.snip()
  sfx.boom()
  sfx.duck(0, 0.05)
  spin = null
  scene.litWire(null)
  scene.shake(0.08)
  scene.blackout()
  strip.dim(false)
  setStatus('')
  $('#strip').hidden = true
  $('#break').hidden = true
  await flashWhite()
  await sleep(1900)
  if (play !== game) return
  const lines = me()!.linesTyped
  $('#deadText').textContent = `You got through ${plural(lines, 'line')} before the device found the ${WIRE_NAMES[wire]} wire. It was live the whole time. You went dark ${ordinal(place)} of ${play.room.desks.length}.`
  show('#dead')
  $('#again').focus()
}

function win() {
  clearRoll()
  sfx.duck(1, 1.2)
  sfx.relief()
  setStatus('')
  $('#wonText').textContent = `You outlasted ${plural(play.room.desks.length - 1, 'desk')} over ${plural(play.room.round, 'round')}, with ${plural(wiresLeft(me()!), 'wire')} still on your device.`
  show('#won')
  $('#replay').focus()
}

function distantDesk(event: RoomEvent) {
  if (!('desk' in event)) return
  const name = `Desk ${event.desk}`
  if (event.type === 'out') {
    setTimeout(() => {
      sfx.thump()
      scene.flicker(0.35)
      scene.shake(0.004)
      if (calm()) flashStatus(`${name} went dark.`)
    }, Math.random() * 500)
  }
  if (event.type === 'roll' && event.reason === 'last' && calm()) setStatus(`${name} finished last. Its device is choosing a wire.`)
  if (event.type === 'cut' && deskById(play.room, event.desk).done && play.room.lastCut && calm()) flashStatus(`${name} kept its light.`)
}

function handle(events: RoomEvent[]) {
  for (const event of events) {
    const desk = me()
    if (!desk || ('desk' in event && event.desk !== desk.id)) {
      distantDesk(event)
      continue
    }
    switch (event.type) {
      case 'slip':
        sfx.slip()
        hurt()
        scene.shake(0.012)
        strip.shake()
        strip.show(currentLine(play.room, desk), desk.pos, true)
        setTimeout(() => {
          const now = me()
          if (now && !now.roll) strip.show(currentLine(play.room, now), now.pos)
        }, 220)
        break
      case 'roll': {
        const remaining = Array.from({ length: WIRES }, (_, i) => i).filter(i => !desk.cut.includes(i))
        spin = planSpin(remaining, event.wire)
        spinShown = -1
        strip.dim(true)
        scene.setDread(true)
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
        scene.cutWire(event.wire)
        flashStatus(`The ${WIRE_NAMES[event.wire]} wire. ${desk.done ? 'Still lit.' : 'Keep typing.'}`)
        break
      case 'out':
        explode(event.wire, event.place)
        break
      case 'break': {
        if (desk.out) break
        const left = wiresLeft(desk)
        const others = alive(play.room).length - 1
        $('#breakEyebrow').textContent = `Round ${event.round}`
        $('#breakText').textContent = `${others} of ${plural(play.room.desks.length - 1, 'other desk')} ${others === 1 ? 'is' : 'are'} still lit. Your device has ${plural(left, 'wire')} left, so the next cut is 1 in ${left}.`
        $('#break').hidden = false
        break
      }
      case 'round':
        $('#break').hidden = true
        break
      case 'over':
        if (event.winner === desk.id) win()
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
  scene.pressKey(e.key)
  const events = play.press(e.key)
  if (events.length) sfx.key()
  handle(events)
})

let last = performance.now()
setInterval(() => {
  const now = performance.now()
  const ms = now - last
  last = now
  if (!live) return
  handle(play.tick(ms))
  showSpin()
}, 20)

function heartbeat() {
  const desk = me()
  const on = playing() && !!desk
  const rolling = on && desk.roll ? 1 : 0
  const slips = on ? desk.slips : 0
  const low = on && desk.lineLeft <= 10_000 ? 1 : 0
  scene.setNerves(1 + slips * 0.35 + rolling * 0.8)
  scene.beat()
  if (on) sfx.beat(Math.min(0.45 + slips * 0.18 + rolling * 0.5, 1.2))
  setTimeout(heartbeat, 60000 / (64 + slips * 16 + rolling * 48 + low * 18))
}

function begin(next: Play) {
  play = next
  clearRoll()
  scene.resetWires()
  scene.relight()
  const desk = me()
  for (const wire of desk?.cut ?? []) scene.cutWire(wire)
  document.querySelectorAll('.desk-name').forEach(el => (el.textContent = desk ? `Desk ${desk.id}` : 'Watching'))
  $('#strip').hidden = !desk || desk.out
  $('#room').hidden = false
  setStatus('')
  sfx.duck(1, 0.6)
  shownSeconds = -1
  shownDisplay = ''
  live = true
  last = performance.now()
  if (!desk || desk.out || play.room.phase === 'over') show('#lobby')
  else show(null)
  refresh()
}

function renderLobby() {
  if (!code) return
  const desk = me()
  const seated = live && !!desk && !desk.out && play.room.phase !== 'over'
  $('#lobbyCode').textContent = `Room ${code}`
  const extra = botCount()
  const total = Math.min(lobby.people, DESKS.length) + extra
  $('#lobbyText').textContent = `${lobby.people === 1 ? 'Just you' : `${lobby.people} people`} at the table so far. Send the link to friends, and the host picks how many bots take the empty desks.`
  $<HTMLInputElement>('#lobbyLink').value = roomLink(code)
  $('#botsRow').hidden = !lobby.host || lobby.playing
  $('#botCount').textContent = String(extra)
  $<HTMLButtonElement>('#fewerBots').disabled = extra === 0
  $<HTMLButtonElement>('#moreBots').disabled = extra >= openDesks()
  $('#botNote').textContent = `${plural(total, 'desk')} in all`
  $('#startGame').hidden = !lobby.host || lobby.playing
  $<HTMLButtonElement>('#startGame').disabled = total < MIN_DESKS
  $('#lobbyState').textContent = lobby.playing
    ? seated
      ? 'Your game is still running.'
      : "A game is running. You'll get a desk in the next one."
    : lobby.host
      ? total < MIN_DESKS
        ? 'Add a bot or wait for a friend.'
        : 'Start whenever everyone is seated.'
      : 'Waiting for the host to start.'
}

function sitAtTable(room: string) {
  code = room
  bots = null
  setRoomInUrl(room)
  table?.leave()
  live = false
  $('#strip').hidden = true
  $('#room').hidden = true
  show('#lobby')
  renderLobby()
  table = joinRoom(ROOMS_URL, room, playerId(), {
    lobby(next) {
      lobby = next
      renderLobby()
    },
    game(next) {
      begin(next)
      renderLobby()
    },
    lost() {
      setStatus('Lost the room. Reconnecting.')
    },
    back() {
      setStatus('')
    },
  })
}

function leaveTable() {
  table?.leave()
  table = null
  code = null
  setRoomInUrl(null)
  live = false
  play = localPlay(Date.now())
  $('#strip').hidden = false
  $('#room').hidden = false
  clearRoll()
  scene.resetWires()
  scene.relight()
  setStatus('')
  setIntro()
  show('#intro')
  refresh()
}

function setIntro() {
  $('#introEyebrow').textContent = code ? `Room ${code}` : '8 desks \u00b7 6 wires'
  $('#friends').textContent = code ? 'Play solo instead' : 'Play with friends'
  for (const id of ['#again', '#replay']) $(id).textContent = code ? 'Back to the table' : id === '#again' ? 'Sit back down' : 'Play again'
}

$('#start').addEventListener('click', () => {
  startAudio()
  $('#start').blur()
  if (code) return sitAtTable(code)
  begin(localPlay(Date.now()))
})

$('#friends').addEventListener('click', () => {
  startAudio()
  $('#friends').blur()
  if (code) return leaveTable()
  sitAtTable(newCode())
  setIntro()
})

for (const id of ['#again', '#replay']) {
  $(id).addEventListener('click', () => {
    startAudio()
    $(id).blur()
    if (!code) return begin(localPlay(Date.now()))
    show('#lobby')
    renderLobby()
  })
}

$('#startGame').addEventListener('click', () => table?.start(botCount()))
$('#fewerBots').addEventListener('click', () => {
  bots = Math.max(0, botCount() - 1)
  renderLobby()
})
$('#moreBots').addEventListener('click', () => {
  const next = botCount() + 1
  bots = next >= openDesks() ? null : next
  renderLobby()
})
$('#leaveRoom').addEventListener('click', leaveTable)
$('#copyLink').addEventListener('click', async () => {
  const input = $<HTMLInputElement>('#lobbyLink')
  try {
    await navigator.clipboard.writeText(input.value)
    $('#copyLink').textContent = 'Copied'
  } catch {
    input.select()
  }
  setTimeout(() => ($('#copyLink').textContent = 'Copy link'), 1600)
})

setIntro()
refresh()
document.fonts.ready.then(() => scene.setDisplay(40, 6))
heartbeat()
