import { LINES, type Line } from './lines'
import { seeded, shuffle, type Rng } from './random'
import { LINES_PER_ROUND, LINE_MS } from './rules'

export interface Desk {
  id: number
  lineIdx: number
  pos: number
  lineLeft: number
  linesTyped: number
  done: boolean
}

export interface Room {
  rng: Rng
  deck: Line[]
  round: number
  lines: Line[]
  desks: Desk[]
}

export type RoomEvent =
  | { type: 'hit'; desk: number }
  | { type: 'slip'; desk: number }
  | { type: 'line'; desk: number }
  | { type: 'finished'; desk: number }
  | { type: 'timeout'; desk: number }
  | { type: 'round'; round: number }

export function createRoom(seed: number, deskIds: number[]): Room {
  const rng = seeded(seed)
  const room: Room = {
    rng,
    deck: [],
    round: 0,
    lines: [],
    desks: deskIds.map(id => ({ id, lineIdx: 0, pos: 0, lineLeft: LINE_MS, linesTyped: 0, done: false })),
  }
  startRound(room)
  return room
}

export function currentLine(room: Room, desk: Desk) {
  return room.lines[desk.lineIdx]
}

export function deskById(room: Room, id: number) {
  return room.desks.find(desk => desk.id === id)!
}

function drawLines(room: Room) {
  const lines: Line[] = []
  while (lines.length < LINES_PER_ROUND) {
    if (!room.deck.length) room.deck = shuffle(LINES, room.rng)
    lines.push(room.deck.pop()!)
  }
  return lines
}

function startRound(room: Room): RoomEvent[] {
  room.round++
  room.lines = drawLines(room)
  for (const desk of room.desks) {
    desk.lineIdx = 0
    desk.pos = 0
    desk.lineLeft = LINE_MS
    desk.done = false
  }
  return [{ type: 'round', round: room.round }]
}

export function press(room: Room, id: number, key: string): RoomEvent[] {
  const desk = deskById(room, id)
  const line = currentLine(room, desk)
  if (desk.done || !line) return []
  const expected = line.text[desk.pos]!
  if (key.toLowerCase() !== expected.toLowerCase()) return [{ type: 'slip', desk: id }]
  desk.pos++
  const events: RoomEvent[] = [{ type: 'hit', desk: id }]
  if (desk.pos < line.text.length) return events
  desk.linesTyped++
  desk.lineIdx++
  desk.pos = 0
  desk.lineLeft = LINE_MS
  if (desk.lineIdx < room.lines.length) return [...events, { type: 'line', desk: id }]
  desk.done = true
  events.push({ type: 'finished', desk: id })
  if (room.desks.every(d => d.done)) events.push(...startRound(room))
  return events
}

export function advance(room: Room, ms: number): RoomEvent[] {
  const events: RoomEvent[] = []
  for (const desk of room.desks) {
    if (desk.done) continue
    desk.lineLeft -= ms
    if (desk.lineLeft <= 0) {
      desk.lineLeft = LINE_MS
      events.push({ type: 'timeout', desk: desk.id })
    }
  }
  return events
}
