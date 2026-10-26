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
  list: Bot[]
}

const LETTERS = 'abcdefghijklmnopqrstuvwxyz'

export function makeBots(seed: number, ids: number[]): Bots {
  const rng = seeded(seed ^ 0x9e3779b9)
  return {
    rng,
    list: ids.map(id => ({ id, cps: between(rng, 2.4, 4.6), slipRate: between(rng, 0.018, 0.045), wait: between(rng, 400, 1200) })),
  }
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
