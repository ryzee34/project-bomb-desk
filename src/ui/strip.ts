import type { Line } from '../game/lines'

export function createStrip(el: HTMLElement) {
  const text = document.createElement('p')
  text.className = 'text'
  const source = document.createElement('p')
  source.className = 'source'
  el.append(text, source)
  let shown: Line | undefined
  let spans: HTMLSpanElement[] = []

  return {
    note(message: string) {
      if (!shown && text.textContent === message) return
      shown = undefined
      spans = []
      text.replaceChildren(message)
      text.classList.add('waiting')
      source.hidden = true
    },
    show(line: Line | undefined, pos: number, bad = false) {
      if (line !== shown || text.classList.contains('waiting')) {
        text.classList.remove('waiting')
        shown = line
        spans = [...(line?.text ?? '')].map(ch => {
          const span = document.createElement('span')
          span.textContent = ch
          return span
        })
        text.replaceChildren(...spans)
        source.textContent = line?.source ? `\u2014 ${line.source}` : ''
        source.hidden = !line?.source
      }
      spans.forEach((span, i) => (span.className = i < pos ? 'done' : i === pos ? (bad ? 'cur bad' : 'cur') : ''))
    },
    shake() {
      el.classList.remove('shake')
      void el.offsetWidth
      el.classList.add('shake')
    },
    dim(on: boolean) {
      el.classList.toggle('dim', on)
    },
  }
}
