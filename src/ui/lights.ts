import { DESKS } from '../game/rules'
import type { Person } from '../game/protocol'

type Kick = (id: number, button: HTMLButtonElement) => void

export function createLights(el: HTMLElement) {
  let onKick: Kick | null = null
  const lights = DESKS.map(() => {
    const light = document.createElement('div')
    light.setAttribute('role', 'listitem')
    const label = document.createElement('span')
    const kick = document.createElement('button')
    kick.className = 'kick'
    kick.textContent = 'Kick'
    kick.hidden = true
    kick.addEventListener('click', () => {
      kick.blur()
      onKick?.(Number(kick.value), kick)
    })
    light.append(document.createElement('i'), label, kick)
    return { light, label, kick }
  })
  el.replaceChildren(...lights.map(({ light }) => light))

  return {
    render(who: Person[], you: number, bots: number, kick: Kick | null) {
      onKick = kick
      lights.forEach(({ light, label, kick: button }, i) => {
        const person = who[i]
        const kind = person ? 'player' : i < who.length + bots ? 'bot' : 'empty'
        label.textContent = person ? person.name || (i === you ? 'You' : 'Guest') : kind === 'bot' ? 'Bot' : 'Open'
        light.className = `light ${kind}`
        light.classList.toggle('you', i === you)
        light.classList.toggle('away', !!person?.away)
        light.setAttribute('aria-label', i === you && person?.name ? `${person.name}, you` : person?.away ? `${label.textContent}, not responding` : label.textContent)
        button.hidden = !kick || !person || i === you
        if (person) button.value = String(person.id)
      })
    },
  }
}
