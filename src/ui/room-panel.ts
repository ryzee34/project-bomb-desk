import { progress, wiresLeft, type Room } from '../game/room'
import { YOUR_DESK } from '../game/rules'

interface Row {
  el: HTMLDivElement
  odds: HTMLSpanElement
  bar: HTMLElement
}

export function createRoomPanel(el: HTMLElement) {
  let rows = new Map<number, Row>()

  function build(room: Room) {
    const heading = document.createElement('h2')
    heading.textContent = 'The room'
    rows = new Map()
    const els = room.desks.map(desk => {
      const row = document.createElement('div')
      row.className = desk.id === YOUR_DESK ? 'desk you' : 'desk'
      const dot = document.createElement('span')
      dot.className = 'dot'
      const name = document.createElement('span')
      name.textContent = desk.id === YOUR_DESK ? `Desk ${desk.id} \u00b7 you` : `Desk ${desk.id}`
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
    render(room: Room) {
      if (rows.size !== room.desks.length || room.desks.some(desk => !rows.has(desk.id))) build(room)
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
