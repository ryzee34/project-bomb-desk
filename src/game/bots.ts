import { between, seeded, type Rng } from './random'
import { currentLine, deskById, press, type Room, type RoomEvent } from './room'

export interface Bot {
  id: number
  cps: number
  slipRate: number
  wait: number
}

export interface Bots {
  rng: Rng
  level: number
  list: Bot[]
}

export const LEVELS = [
  { name: 'Easy', cps: [2.2, 3.2], slips: [0.05, 0.08] },
  { name: 'Normal', cps: [2.4, 4.6], slips: [0.018, 0.045] },
  { name: 'Hard', cps: [3.2, 5.8], slips: [0.012, 0.03] },
  { name: 'Expert', cps: [4.4, 7.6], slips: [0.01, 0.022] },
  { name: 'Brutal', cps: [5.6, 9.6], slips: [0.008, 0.018] },
] as const

export const NORMAL = 1

const LETTERS = 'abcdefghijklmnopqrstuvwxyz'

export function pickLevel(level: unknown) {
  return typeof level === 'number' && Number.isInteger(level) && level >= 0 && level < LEVELS.length ? level : NORMAL
}

function makeBot(rng: Rng, id: number, level: number): Bot {
  const { cps, slips } = LEVELS[level]!
  return { id, cps: between(rng, cps[0], cps[1]), slipRate: between(rng, slips[0], slips[1]), wait: between(rng, 400, 1200) }
}

export function makeBots(seed: number, ids: number[], level = NORMAL): Bots {
  const rng = seeded(seed ^ 0x9e3779b9)
  return { rng, level, list: ids.map(id => makeBot(rng, id, level)) }
}

export function addBot(bots: Bots, id: number) {
  if (!bots.list.some(bot => bot.id === id)) bots.list.push(makeBot(bots.rng, id, bots.level))
}

export function dropBot(bots: Bots, id: number) {
  bots.list = bots.list.filter(bot => bot.id !== id)
}

function wrongKey(rng: Rng, expected: string) {
  let key = expected
  while (key.toLowerCase() === expected.toLowerCase()) key = LETTERS[Math.floor(rng() * LETTERS.length)]!
  return key
}

export function driveBots(room: Room, bots: Bots, ms: number): RoomEvent[] {
  const events: RoomEvent[] = []
  const { rng } = bots
  for (const bot of bots.list) {
    bot.wait -= ms
    while (bot.wait <= 0) {
      const desk = deskById(room, bot.id)
      const line = currentLine(room, desk)
      if (room.phase !== 'typing' || desk.out || desk.done || desk.roll || !line) {
        bot.wait = between(rng, 300, 900)
        break
      }
      const expected = line.text[desk.pos]!
      const slip = rng() < bot.slipRate
      events.push(...press(room, bot.id, slip ? wrongKey(rng, expected) : expected))
      bot.wait += (1000 / bot.cps) * between(rng, 0.5, 1.5) + (slip ? between(rng, 250, 600) : 0)
    }
  }
  return events
}
