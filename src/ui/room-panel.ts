import { LEVELS } from '../game/bots'
import { odds, progress } from '../game/room'
import type { Play } from '../play/play'

type Kick = (id: number, button: HTMLButtonElement) => void

interface Row {
  el: HTMLDivElement
  odds: HTMLSpanElement
  bar: HTMLElement
}

export function createRoomPanel(el: HTMLElement) {
  let rows = new Map<number, Row>()
  let label = ''
  let onKick: Kick | null = null

  function build({ room, you, humans, names, level }: Play, kicks: Map<number, number>) {
    const heading = document.createElement('h2')
    heading.textContent = room.desks.some(desk => !humans.has(desk.id)) ? `The room \u00b7 ${LEVELS[level]!.name}` : 'The room'
    rows = new Map()
    const els = room.desks.map(desk => {
      const row = document.createElement('div')
      row.className = desk.id === you ? 'desk you' : 'desk'
      const dot = document.createElement('span')
      dot.className = 'dot'
      const name = document.createElement('span')
      name.className = 'who'
      const called = names.get(desk.id)
      name.textContent =
        desk.id === you
          ? `${called || `Desk ${desk.id}`} \u00b7 you`
          : humans.has(desk.id)
            ? called || `Desk ${desk.id} \u00b7 player`
            : `Desk ${desk.id} \u00b7 bot`
      const odds = document.createElement('span')
      odds.className = 'odds'
      const track = document.createElement('span')
      track.className = 'bar'
      const bar = document.createElement('i')
      track.append(bar)
      const end = document.createElement('span')
      end.className = 'end'
      const id = kicks.get(desk.id)
      if (id !== undefined && desk.id !== you) {
        const kick = document.createElement('button')
        kick.className = 'kick'
        kick.textContent = 'Kick'
        kick.addEventListener('click', () => {
          kick.blur()
          onKick?.(id, kick)
        })
        end.append(kick)
      }
      end.append(odds)
      row.append(dot, name, end, track)
      rows.set(desk.id, { el: row, odds, bar })
      return row
    })
    el.replaceChildren(heading, ...els)
  }

  return {
    render(play: Play, kicks: Map<number, number>, kick: Kick | null) {
      const { room, you, humans, names, level } = play
      onKick = kick
      const key = JSON.stringify([room.desks.map(desk => desk.id), you, [...humans], [...names], level, [...kicks]])
      if (key !== label) {
        label = key
        build(play, kicks)
      }
      for (const desk of room.desks) {
        const row = rows.get(desk.id)!
        row.el.classList.toggle('out', desk.out)
        row.el.classList.toggle('rolling', !!desk.roll)
        row.el.classList.toggle('won', room.winner === desk.id)
        row.odds.textContent = desk.out ? 'dark' : `1 in ${odds(desk, room.round)}`
        row.bar.style.width = `${(desk.out ? 0 : desk.done ? 1 : progress(room, desk)) * 100}%`
      }
    },
  }
}
