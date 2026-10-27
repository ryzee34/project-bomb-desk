import './style.css'
import { sfx, startAudio } from './audio/sound'
import { LEVELS, NORMAL, pickLevel } from './game/bots'
import { alive, currentLine, deskById, odds, wiresLeft, type RoomEvent } from './game/room'
import { DESKS, EARLY_ROUNDS, MIN_DESKS, SPIN_MS, WIRES, WIRE_NAMES } from './game/rules'
import { cleanName } from './game/protocol'
import { newCode, playerId, roomFromUrl, roomLink, saveLevel, saveName, savedLevel, savedName, setRoomInUrl } from './play/codes'
import { localPlay } from './play/local'
import type { Play } from './play/play'
import { joinRoom, type Lobby, type Table } from './play/remote'
import { createDeskScene } from './scene/desk'
import { planSpin, spinStep, type Spin } from './scene/spin'
import { paintGrain } from './ui/film'
import { ordinal } from './ui/format'
import { flashWhite, hurt, renderHud, setStatus } from './ui/hud'
import { createLights } from './ui/lights'
import { createRoomPanel } from './ui/room-panel'
import { createStrip } from './ui/strip'
import { createWatch } from './ui/watch'

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const ROOMS_URL = import.meta.env.VITE_ROOMS_URL ?? 'ws://127.0.0.1:8787'
const CARDS = ['#intro', '#lobby', '#dead', '#break', '#won']

paintGrain($('#grain'))
const scene = createDeskScene($('#scene'), reduced)
const strip = createStrip($('#strip'))
const panel = createRoomPanel($('#room'))
const lights = createLights($('#lobbyLights'))
const watch = createWatch($('#ring'))

let level = pickLevel(savedLevel())
let play: Play = localPlay(Date.now(), level)
let live = false
let code = roomFromUrl()
let table: Table | null = null
let lobby: Lobby = { host: false, you: 0, people: 0, who: [], bots: null, level: NORMAL, playing: false }
let bots: number | null = null
let shownDisplay = ''
let shownSeconds = -1
let statusTimer = 0
let spin: Spin | null = null
let spinShown = -1
let renameTimer = 0
let escAt = 0
let badUntil = 0
let armed = 0

const me = () => (play.you === null ? null : deskById(play.room, play.you))
const playing = () => {
  const desk = me()
  return live && !!desk && !desk.out && play.room.phase !== 'over'
}
const calm = () => playing() && !me()!.roll
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const openDesks = () => DESKS.length - Math.min(lobby.people, DESKS.length)
const botCount = () => Math.min(bots ?? openDesks(), openDesks())
const called = (id: number) => play.names.get(id) || `Desk ${id}`
const its = (id: number) => (play.names.get(id) ? 'their' : 'its')

function show(card: string | null) {
  for (const id of CARDS) $(id).hidden = id !== card
  $('#menu').hidden = card === '#intro'
}

function flashStatus(text: string, ms = 2200) {
  setStatus(text)
  clearTimeout(statusTimer)
  statusTimer = window.setTimeout(() => setStatus(''), ms)
}

function confirmKick(id: number, button: HTMLButtonElement) {
  if (armed !== id) {
    armed = id
    button.textContent = 'Sure?'
    button.classList.add('armed')
    setTimeout(() => {
      if (armed === id) armed = 0
      button.textContent = 'Kick'
      button.classList.remove('armed')
    }, 3000)
    return
  }
  armed = 0
  table?.kick(id)
}

function kicks() {
  const people = lobby.host && code ? lobby.who : []
  return new Map(people.flatMap(person => (person.desk === null ? [] : [[person.desk, person.id] as const])))
}

function refresh() {
  const room = play.room
  panel.render(play, kicks(), lobby.host ? confirmKick : null)
  if (!$('#dead').hidden) watch.render(play)
  if (room.phase === 'break') $('#breakCount').textContent = `Round ${room.round + 1} in ${Math.max(1, Math.ceil(room.breakLeft / 1000))}`
  const desk = me()
  if (!desk) return
  const seconds = Math.ceil(desk.lineLeft / 1000)
  renderHud({ round: room.round, line: Math.min(desk.lineIdx + 1, room.lines.length), seconds, slips: desk.slips, wires: wiresLeft(desk), odds: odds(desk, room.round) })
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
  else strip.show(currentLine(room, desk), desk.pos, performance.now() < badUntil)
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
  watchRoom(
    'Your desk went dark',
    `You got through ${plural(lines, 'line')} before the device found the ${WIRE_NAMES[wire]} wire. It was live the whole time. You went dark ${ordinal(place)} of ${play.room.desks.length}.`,
  )
  $('#again').focus()
}

function watchRoom(title: string, text: string) {
  $('#deadTitle').textContent = title
  $('#deadText').textContent = text
  show('#dead')
  refresh()
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
  const name = called(event.desk)
  if (event.type === 'out') {
    setTimeout(() => {
      sfx.thump()
      scene.flicker(0.35)
      scene.shake(0.004)
      if (calm()) flashStatus(`${name} went dark.`)
    }, Math.random() * 500)
  }
  if (event.type === 'roll' && event.reason === 'last' && calm()) setStatus(`${name} finished last. ${its(event.desk) === 'its' ? 'Its' : 'Their'} device is choosing a wire.`)
  if (event.type === 'cut' && deskById(play.room, event.desk).done && play.room.lastCut && calm()) flashStatus(`${name} kept ${its(event.desk)} light.`)
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
        badUntil = performance.now() + 220
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
        $('#breakText').textContent = `${others} of ${plural(play.room.desks.length - 1, 'other desk')} ${others === 1 ? 'is' : 'are'} still lit. Your device has ${plural(left, 'wire')} left${event.round < EARLY_ROUNDS ? ` and round ${event.round + 1} still runs at half odds` : ''}, so the next cut is 1 in ${odds(desk, event.round + 1)}.`
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

function escape() {
  if (!$('#intro').hidden) return
  if (playing() && performance.now() - escAt > 2000) {
    escAt = performance.now()
    flashStatus(code ? 'Press Esc again to leave. A bot takes over your desk.' : 'Press Esc again to quit to the menu.', 2000)
    return
  }
  escAt = 0
  backToMenu()
}

addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement) return
  if (e.key === 'Escape') return escape()
  if (!playing()) return
  if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
  if (e.key.length !== 1) return
  e.preventDefault()
  scene.pressKey(e.key)
  const events = play.press(e.key)
  if (events.length) sfx.key()
  else if (me()?.missed) badUntil = performance.now() + 220
  if (me()?.missed && e.getModifierState('CapsLock')) flashStatus('Caps Lock is on.')
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
  const title = !desk ? 'Watching' : play.names.get(desk.id) ? `${play.names.get(desk.id)} \u00b7 Desk ${desk.id}` : `Desk ${desk.id}`
  document.querySelectorAll('.desk-name').forEach(el => (el.textContent = title))
  $('#strip').hidden = !desk || desk.out
  $('#room').hidden = false
  setStatus('')
  sfx.duck(1, 0.6)
  shownSeconds = -1
  shownDisplay = ''
  live = true
  last = performance.now()
  if (play.room.phase === 'over') show('#lobby')
  else if (!desk) watchRoom('Watching the room', "A game is running. You'll get a desk in the next one.")
  else if (desk.out) watchRoom('Your desk went dark', 'Your desk is dark for the rest of this game.')
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
  const waiting = lobby.people - DESKS.length
  const plan = lobby.host
    ? 'Send the link to friends, then pick how many bots take the empty desks.'
    : lobby.bots === null
      ? 'Send the link to friends. The host picks how many bots take the empty desks.'
      : lobby.bots
        ? `Send the link to friends. The host is filling ${plural(lobby.bots, 'empty desk')} with ${LEVELS[lobby.level]!.name} bots.`
        : 'Send the link to friends. The host is playing without bots.'
  $('#lobbyText').textContent = waiting > 0 ? `${plan} The table seats ${DESKS.length}, so ${plural(waiting, 'player')} will watch.` : plan
  lights.render(lobby.who.slice(0, DESKS.length), lobby.you, lobby.host ? extra : (lobby.bots ?? 0), lobby.host ? confirmKick : null)
  $<HTMLInputElement>('#lobbyLink').value = roomLink(code)
  $('#botsRow').hidden = !lobby.host || lobby.playing
  $('#lobbyLevels').hidden = !lobby.host || lobby.playing
  $('#botCount').textContent = String(extra)
  $<HTMLButtonElement>('#fewerBots').disabled = extra === 0
  $<HTMLButtonElement>('#moreBots').disabled = extra >= openDesks()
  $('#botNote').textContent = `${plural(total, 'desk')} in all`
  $('#startGame').hidden = !lobby.host || lobby.playing
  $('#watchGame').hidden = !lobby.playing || seated
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
  table = joinRoom(ROOMS_URL, room, playerId(), () => cleanName($<HTMLInputElement>('#playerName').value), {
    lobby(next) {
      lobby = next
      if (next.host && (next.bots !== botCount() || next.level !== level)) table?.setup(bots, level)
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
    kicked() {
      const room = code
      backToMenu()
      $('#introNote').textContent = `The host removed you from room ${room}.`
      $('#introNote').hidden = false
    },
  })
}

function backToMenu() {
  table?.leave()
  table = null
  code = null
  setRoomInUrl(null)
  live = false
  play = localPlay(Date.now(), level)
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

function renderLevels() {
  document.querySelectorAll<HTMLButtonElement>('.level').forEach(button => button.setAttribute('aria-checked', String(Number(button.value) === level)))
}

function setIntro() {
  $('#introLevels').hidden = !!code
  $('#introEyebrow').textContent = code ? `Room ${code}` : '8 desks \u00b7 6 wires'
  $('#friends').textContent = code ? 'Main menu' : 'Play with friends'
  for (const id of ['#again', '#replay']) $(id).textContent = code ? 'Back to the table' : id === '#again' ? 'Sit back down' : 'Play again'
}

$('#start').addEventListener('click', () => {
  $('#introNote').hidden = true
  startAudio()
  $('#start').blur()
  if (code) return sitAtTable(code)
  begin(localPlay(Date.now(), level))
})

$('#friends').addEventListener('click', () => {
  $('#introNote').hidden = true
  startAudio()
  $('#friends').blur()
  if (code) return backToMenu()
  sitAtTable(newCode())
  setIntro()
})

for (const id of ['#again', '#replay']) {
  $(id).addEventListener('click', () => {
    startAudio()
    $(id).blur()
    if (!code) return begin(localPlay(Date.now(), level))
    show('#lobby')
    renderLobby()
  })
}

$('#startGame').addEventListener('click', () => table?.start(botCount(), level))
$('#watchGame').addEventListener('click', () => {
  $('#watchGame').blur()
  show('#dead')
  refresh()
})
$('#fewerBots').addEventListener('click', () => {
  bots = Math.max(0, botCount() - 1)
  table?.setup(bots, level)
  renderLobby()
})
$('#moreBots').addEventListener('click', () => {
  const next = botCount() + 1
  bots = next >= openDesks() ? null : next
  table?.setup(bots, level)
  renderLobby()
})
document.querySelectorAll<HTMLButtonElement>('[data-menu]').forEach(button =>
  button.addEventListener('click', () => {
    button.blur()
    backToMenu()
  }),
)
for (const group of document.querySelectorAll('.levels')) {
  group.append(
    ...LEVELS.map((option, i) => {
      const button = document.createElement('button')
      button.className = 'level'
      button.value = String(i)
      button.textContent = option.name
      button.setAttribute('role', 'radio')
      button.addEventListener('click', () => {
        level = i
        saveLevel(i)
        table?.setup(bots, level)
        renderLevels()
      })
      return button
    }),
  )
}
renderLevels()

$<HTMLInputElement>('#playerName').value = savedName()
$('#playerName').addEventListener('input', () => {
  clearTimeout(renameTimer)
  renameTimer = window.setTimeout(() => {
    const name = cleanName($<HTMLInputElement>('#playerName').value)
    saveName(name)
    table?.rename(name)
  }, 400)
})
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
