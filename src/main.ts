import './style.css'
import { createDeskScene } from './scene/desk'
import { paintGrain } from './ui/film'

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

paintGrain($('#grain'))
const desk = createDeskScene($('#scene'), reduced)
desk.setDisplay(40, 6)
document.fonts.ready.then(() => desk.setDisplay(40, 6))

setInterval(() => desk.beat(), 60000 / 64)
