import { LEVELS } from '../game/bots'
import { progress, wiresLeft } from '../game/room'
import type { Play } from '../play/play'

interface Row {
  el: HTMLDivElement
  odds: HTMLSpanElement
  bar: HTMLElement
}

export function createRoomPanel(el: HTMLElement) {
  let rows = new Map<number, Row>()
  let label = ''

  function build({ room, you, humans, names, level }: Play) {
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
      row.append(dot, name, odds, track)
      rows.set(desk.id, { el: row, odds, bar })
      return row
    })
    el.replaceChildren(heading, ...els)
  }

  return {
    render(play: Play) {
      const { room, you, humans, names, level } = play
      const key = JSON.stringify([room.desks.map(desk => desk.id), you, [...humans], [...names], level])
      if (key !== label) {
        label = key
        build(play)
      }
      for (const desk of room.desks) {
        const row = rows.get(desk.id)!
        row.el.classList.toggle('out', desk.out)
        row.el.classList.toggle('rolling', !!desk.roll)
        row.el.classList.toggle('won', room.winner === desk.id)
        row.odds.textContent = desk.out ? 'dark' : `1 in ${wiresLeft(desk)}`
        row.bar.style.width = `${(desk.out ? 0 : desk.done ? 1 : progress(room, desk)) * 100}%`
      }
    },
  }
}
