import { clock } from './format'

const $ = (selector: string) => document.querySelector<HTMLElement>(selector)!

export function renderHud(state: { round: number; line: number; seconds: number; slips: number; wires: number; odds: number }) {
  $('#round').textContent = String(state.round)
  $('#line').textContent = String(state.line)
  $('#timer').textContent = clock(state.seconds)
  $('#timer').classList.toggle('low', state.seconds <= 10)
  document.querySelectorAll('.pip').forEach((pip, i) => pip.classList.toggle('on', i < state.slips))
  $('#odds').textContent = `${state.wires} wire${state.wires === 1 ? '' : 's'} \u00b7 1 in ${state.odds}`
}

export function setStatus(text: string) {
  $('#status').textContent = text
}

export function hurt() {
  const el = $('#hurt')
  el.classList.add('on')
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('on')))
}

export async function flashWhite() {
  const el = $('#flash')
  el.style.transition = 'none'
  el.style.opacity = '1'
  await new Promise(resolve => setTimeout(resolve, 120))
  el.style.transition = 'opacity 2.4s ease-out'
  el.style.opacity = '0'
}
