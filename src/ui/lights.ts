import { DESKS } from '../game/rules'

export function createLights(el: HTMLElement) {
  const lights = DESKS.map(() => {
    const light = document.createElement('div')
    light.setAttribute('role', 'listitem')
    const label = document.createElement('span')
    light.append(document.createElement('i'), label)
    return { light, label }
  })
  el.replaceChildren(...lights.map(({ light }) => light))

  return {
    render(names: string[], you: number, bots: number) {
      lights.forEach(({ light, label }, i) => {
        const kind = i < names.length ? 'player' : i < names.length + bots ? 'bot' : 'empty'
        label.textContent = kind === 'player' ? names[i] || (i === you ? 'You' : 'Guest') : kind === 'bot' ? 'Bot' : 'Open'
        light.className = i === you ? `light ${kind} you` : `light ${kind}`
        light.setAttribute('aria-label', i === you && names[i] ? `${names[i]}, you` : label.textContent)
      })
    },
  }
}
