import { clock } from './format'

const $ = (selector: string) => document.querySelector<HTMLElement>(selector)!

export function renderHud(state: { round: number; line: number; seconds: number }) {
  $('#round').textContent = String(state.round)
  $('#line').textContent = String(state.line)
  $('#timer').textContent = clock(state.seconds)
  $('#timer').classList.toggle('low', state.seconds <= 10)
}

export function setStatus(text: string) {
  $('#status').textContent = text
}

export function hurt() {
  const el = $('#hurt')
  el.classList.add('on')
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('on')))
}
