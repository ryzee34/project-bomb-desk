import type { Room, RoomEvent } from '../game/room'

export interface Play {
  room: Room
  you: number | null
  humans: Set<number>
  press(key: string): RoomEvent[]
  tick(ms: number): RoomEvent[]
}
