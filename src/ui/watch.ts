import { alive, odds, progress, type Desk, type Room } from '../game/room'
import { WIRES } from '../game/rules'
import type { Play } from '../play/play'
import { WIRE_HEX } from '../scene/desk'
import { planSpin, spinStep, type Spin } from '../scene/spin'
import { clock, ordinal } from './format'

interface Station {
  el: HTMLDivElement
  bar: HTMLElement
  state: HTMLSpanElement
  wires: HTMLElement[]
  pips: HTMLElement[]
  odds: HTMLSpanElement
}

const span = (className: string) => {
  const el = document.createElement('span')
  el.className = className
  return el
}

export function createWatch(el: HTMLElement) {
  let stations = new Map<number, Station>()
  let label = ''
  const spins = new Map<number, { key: string; spin: Spin }>()
  const hub = document.createElement('div')
  hub.className = 'hub'
  const eyebrow = span('small')
  const big = document.createElement('b')
  const note = span('small')
  hub.append(eyebrow, big, note)

  function build({ room, you, humans, names }: Play) {
    const start = Math.max(0, room.desks.findIndex(desk => desk.id === you))
    stations = new Map()
    const els = room.desks.map((desk, i) => {
      const slot = (i - start + room.desks.length) % room.desks.length
      const angle = Math.PI / 2 + (slot / room.desks.length) * Math.PI * 2
      const station = document.createElement('div')
      station.className = desk.id === you ? 'station you' : humans.has(desk.id) ? 'station player' : 'station bot'
      station.style.setProperty('--x', `${50 + 41 * Math.cos(angle)}%`)
      station.style.setProperty('--y', `${50 + 39 * Math.sin(angle)}%`)
      const called = names.get(desk.id)
      const who = span('who')
      who.textContent = desk.id === you ? `${called || `Desk ${desk.id}`} · you` : humans.has(desk.id) ? called || `Desk ${desk.id}` : `Desk ${desk.id} · bot`
      const track = span('bar')
      const bar = document.createElement('i')
      track.append(bar)
      const state = span('state')
      const screen = document.createElement('div')
      screen.className = 'screen'
      screen.append(who, track, state)
      const wireBox = span('wires')
      const wires = Array.from({ length: WIRES }, (_, w) => {
        const wire = document.createElement('i')
        wire.style.setProperty('--c', `#${WIRE_HEX[w]!.toString(16).padStart(6, '0')}`)
        return wire
      })
      wireBox.append(...wires)
      const pipBox = span('pips')
      const pips = Array.from({ length: 3 }, () => document.createElement('i'))
      pipBox.append(...pips)
      const oddsEl = span('odds')
      const meta = document.createElement('div')
      meta.className = 'meta'
      meta.append(wireBox, pipBox, oddsEl)
      station.append(screen, span('keys'), meta)
      stations.set(desk.id, { el: station, bar, state, wires, pips, odds: oddsEl })
      return station
    })
    el.replaceChildren(hub, ...els)
  }

  function litWire(room: Room, desk: Desk) {
    if (!desk.roll) return -1
    const key = `${room.round}:${desk.cut.length}:${desk.roll.wire}`
    let entry = spins.get(desk.id)
    if (entry?.key !== key) {
      const remaining = Array.from({ length: WIRES }, (_, i) => i).filter(i => !desk.cut.includes(i))
      entry = { key, spin: planSpin(remaining, desk.roll.wire) }
      spins.set(desk.id, entry)
    }
    const step = spinStep(entry.spin, desk.roll.elapsed)
    return step < 0 ? -1 : entry.spin.wires[step]!
  }

  function stateOf(room: Room, desk: Desk) {
    if (room.winner === desk.id) return 'Last desk lit'
    if (desk.out) return `Dark · ${ordinal(desk.place)}`
    if (desk.roll) return 'Choosing a wire'
    if (desk.done) return 'Round done'
    return `Line ${Math.min(desk.lineIdx + 1, room.lines.length)} · ${clock(desk.lineLeft / 1000)}`
  }

  return {
    render(play: Play) {
      const { room, you, humans, names } = play
      const key = JSON.stringify([room.desks.map(desk => desk.id), you, [...humans], [...names]])
      if (key !== label) {
        label = key
        build(play)
      }
      const called = (id: number) => names.get(id) || `Desk ${id}`
      for (const desk of room.desks) {
        const station = stations.get(desk.id)!
        const lit = litWire(room, desk)
        station.el.classList.toggle('out', desk.out)
        station.el.classList.toggle('rolling', !!desk.roll)
        station.el.classList.toggle('done', desk.done && !desk.out)
        station.el.classList.toggle('won', room.winner === desk.id)
        station.bar.style.width = `${(desk.out ? 0 : desk.done ? 1 : progress(room, desk)) * 100}%`
        station.state.textContent = stateOf(room, desk)
        station.state.classList.toggle('low', !desk.out && !desk.done && !desk.roll && desk.lineLeft <= 10_000)
        station.wires.forEach((wire, i) => {
          wire.classList.toggle('cut', desk.cut.includes(i))
          wire.classList.toggle('lit', i === lit)
        })
        station.pips.forEach((pip, i) => pip.classList.toggle('on', !desk.out && i < desk.slips))
        station.odds.textContent = desk.out || room.phase === 'over' ? '' : `1 in ${odds(desk, room.round)}`
      }
      const left = alive(room)
      const rolling = left.find(desk => desk.roll)
      eyebrow.textContent = room.phase === 'over' ? 'Game over' : `Round ${room.round}`
      big.textContent = room.phase === 'over' ? (room.winner ? called(room.winner) : 'Nobody') : `${left.length} of ${room.desks.length} lit`
      note.textContent =
        room.phase === 'over'
          ? room.winner
            ? 'had the last desk lit'
            : 'every desk went dark'
          : room.phase === 'break'
            ? `Round ${room.round + 1} in ${Math.max(1, Math.ceil(room.breakLeft / 1000))}`
            : rolling
              ? `${called(rolling.id)} is choosing a wire`
              : `${left.filter(desk => !desk.done).length} still typing`
    },
  }
}
