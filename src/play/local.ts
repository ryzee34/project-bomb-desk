import { driveBots, makeBots } from '../game/bots'
import { advance, createRoom, press } from '../game/room'
import { DESKS, YOUR_DESK } from '../game/rules'
import type { Play } from './play'

export function localPlay(seed: number): Play {
  const room = createRoom(seed, DESKS)
  const bots = makeBots(seed, DESKS.filter(id => id !== YOUR_DESK))
  return {
    room,
    you: YOUR_DESK,
    humans: new Set([YOUR_DESK]),
    names: new Map(),
    press: key => press(room, YOUR_DESK, key),
    tick: ms => [...driveBots(room, bots, ms), ...advance(room, ms)],
  }
}
