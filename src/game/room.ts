import { LINES, type Line } from './lines'
import { seeded, shuffle, type Rng } from './random'
import { BREAK_MS, LINES_PER_ROUND, LINE_MS, ROLL_MS, SLIPS_TO_ROLL, WIRES } from './rules'

export type RollReason = 'slips' | 'time'

export interface Roll {
  wire: number
  reason: RollReason
  elapsed: number
}

export interface Desk {
  id: number
  lineIdx: number
  pos: number
  lineLeft: number
  linesTyped: number
  slips: number
  live: number
  cut: number[]
  roll: Roll | null
  done: boolean
  out: boolean
}

export interface Room {
  rng: Rng
  deck: Line[]
  round: number
  lines: Line[]
  desks: Desk[]
  phase: 'typing' | 'break' | 'over'
  breakLeft: number
}

export type RoomEvent =
  | { type: 'hit'; desk: number }
  | { type: 'slip'; desk: number }
  | { type: 'line'; desk: number }
  | { type: 'finished'; desk: number }
  | { type: 'roll'; desk: number; wire: number; reason: RollReason }
  | { type: 'cut'; desk: number; wire: number }
  | { type: 'out'; desk: number; wire: number }
  | { type: 'break'; round: number }
  | { type: 'round'; round: number }
  | { type: 'over' }

export function createRoom(seed: number, deskIds: number[]): Room {
  const rng = seeded(seed)
  const room: Room = {
    rng,
    deck: [],
    round: 0,
    lines: [],
    desks: deskIds.map(id => ({
      id,
      lineIdx: 0,
      pos: 0,
      lineLeft: LINE_MS,
      linesTyped: 0,
      slips: 0,
      live: Math.floor(rng() * WIRES),
      cut: [],
      roll: null,
      done: false,
      out: false,
    })),
    phase: 'typing',
    breakLeft: 0,
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

export function wiresLeft(desk: Desk) {
  return WIRES - desk.cut.length
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
  room.phase = 'typing'
  room.lines = drawLines(room)
  for (const desk of room.desks) {
    desk.lineIdx = 0
    desk.pos = 0
    desk.lineLeft = LINE_MS
    desk.slips = 0
    desk.done = desk.out
  }
  return [{ type: 'round', round: room.round }]
}

function startRoll(room: Room, desk: Desk, reason: RollReason): RoomEvent[] {
  const remaining = Array.from({ length: WIRES }, (_, i) => i).filter(i => !desk.cut.includes(i))
  const wire = remaining[Math.floor(room.rng() * remaining.length)]!
  desk.roll = { wire, reason, elapsed: 0 }
  return [{ type: 'roll', desk: desk.id, wire, reason }]
}

function resolveRoll(desk: Desk): RoomEvent[] {
  const { wire } = desk.roll!
  desk.roll = null
  if (wire === desk.live) {
    desk.out = true
    desk.done = true
    return [{ type: 'out', desk: desk.id, wire }]
  }
  desk.cut.push(wire)
  desk.slips = 0
  desk.lineLeft = LINE_MS
  return [{ type: 'cut', desk: desk.id, wire }]
}

function checkRound(room: Room): RoomEvent[] {
  if (room.phase !== 'typing') return []
  if (room.desks.every(desk => desk.out)) {
    room.phase = 'over'
    return [{ type: 'over' }]
  }
  if (!room.desks.every(desk => desk.done && !desk.roll)) return []
  room.phase = 'break'
  room.breakLeft = BREAK_MS
  return [{ type: 'break', round: room.round }]
}

export function press(room: Room, id: number, key: string): RoomEvent[] {
  const desk = deskById(room, id)
  const line = currentLine(room, desk)
  if (room.phase !== 'typing' || desk.done || desk.roll || !line) return []
  const expected = line.text[desk.pos]!
  if (key.toLowerCase() !== expected.toLowerCase()) {
    desk.slips++
    const events: RoomEvent[] = [{ type: 'slip', desk: id }]
    if (desk.slips >= SLIPS_TO_ROLL) events.push(...startRoll(room, desk, 'slips'))
    return events
  }
  desk.pos++
  const events: RoomEvent[] = [{ type: 'hit', desk: id }]
  if (desk.pos < line.text.length) return events
  desk.linesTyped++
  desk.lineIdx++
  desk.pos = 0
  desk.lineLeft = LINE_MS
  if (desk.lineIdx < room.lines.length) return [...events, { type: 'line', desk: id }]
  desk.done = true
  return [...events, { type: 'finished', desk: id }, ...checkRound(room)]
}

export function advance(room: Room, ms: number): RoomEvent[] {
  const events: RoomEvent[] = []
  if (room.phase === 'break') {
    room.breakLeft -= ms
    if (room.breakLeft <= 0) events.push(...startRound(room))
    return events
  }
  if (room.phase !== 'typing') return events
  for (const desk of room.desks) {
    if (desk.roll) {
      desk.roll.elapsed += ms
      if (desk.roll.elapsed >= ROLL_MS) events.push(...resolveRoll(desk))
      continue
    }
    if (desk.done) continue
    desk.lineLeft -= ms
    if (desk.lineLeft <= 0) {
      desk.lineLeft = 0
      events.push(...startRoll(room, desk, 'time'))
    }
  }
  return [...events, ...checkRound(room)]
}
