import { LINES, type Line } from './lines'
import { seeded, shuffle, type Rng } from './random'
import { BREAK_MS, EARLY_ODDS, EARLY_ROUNDS, LINES_PER_ROUND, LINE_MS, ROLL_MS, SLIPS_TO_ROLL, WIRES } from './rules'

export type RollReason = 'slips' | 'time' | 'last'

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
  missed: boolean
  live: number
  cut: number[]
  roll: Roll | null
  done: boolean
  finishedAs: number
  out: boolean
  place: number
}

export interface Room {
  rng: Rng
  deck: Line[]
  round: number
  lines: Line[]
  desks: Desk[]
  phase: 'typing' | 'break' | 'over'
  breakLeft: number
  finished: number
  lastCut: boolean
  winner: number | null
}

export type RoomEvent =
  | { type: 'hit'; desk: number }
  | { type: 'slip'; desk: number }
  | { type: 'line'; desk: number }
  | { type: 'finished'; desk: number }
  | { type: 'roll'; desk: number; wire: number; reason: RollReason }
  | { type: 'cut'; desk: number; wire: number }
  | { type: 'out'; desk: number; wire: number; place: number }
  | { type: 'break'; round: number }
  | { type: 'round'; round: number }
  | { type: 'over'; winner: number | null }

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
      missed: false,
      live: Math.floor(rng() * WIRES),
      cut: [],
      roll: null,
      done: false,
      finishedAs: 0,
      out: false,
      place: 0,
    })),
    phase: 'typing',
    breakLeft: 0,
    finished: 0,
    lastCut: false,
    winner: null,
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

export function odds(desk: Desk, round: number) {
  return wiresLeft(desk) * (round <= EARLY_ROUNDS ? EARLY_ODDS : 1)
}

export function alive(room: Room) {
  return room.desks.filter(desk => !desk.out)
}

export function progress(room: Room, desk: Desk) {
  const total = room.lines.reduce((sum, line) => sum + line.text.length, 0)
  const typed = room.lines.slice(0, desk.lineIdx).reduce((sum, line) => sum + line.text.length, 0) + desk.pos
  return total ? Math.min(1, typed / total) : 0
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
  room.finished = 0
  room.lastCut = false
  for (const desk of room.desks) {
    desk.lineIdx = 0
    desk.pos = 0
    desk.lineLeft = LINE_MS
    desk.slips = 0
    desk.missed = false
    desk.done = desk.out
    desk.finishedAs = 0
  }
  return [{ type: 'round', round: room.round }]
}

function startRoll(room: Room, desk: Desk, reason: RollReason): RoomEvent[] {
  const safe = Array.from({ length: WIRES }, (_, i) => i).filter(i => i !== desk.live && !desk.cut.includes(i))
  const dark = !safe.length || room.rng() * odds(desk, room.round) < 1
  const wire = dark ? desk.live : safe[Math.floor(room.rng() * safe.length)]!
  desk.roll = { wire, reason, elapsed: 0 }
  return [{ type: 'roll', desk: desk.id, wire, reason }]
}

function resolveRoll(room: Room, desk: Desk): RoomEvent[] {
  const { wire } = desk.roll!
  desk.roll = null
  if (wire === desk.live) {
    desk.out = true
    desk.done = true
    desk.place = alive(room).length + 1
    return [{ type: 'out', desk: desk.id, wire, place: desk.place }, ...checkOver(room)]
  }
  desk.cut.push(wire)
  desk.slips = 0
  desk.missed = false
  desk.lineLeft = LINE_MS
  return [{ type: 'cut', desk: desk.id, wire }]
}

function checkOver(room: Room): RoomEvent[] {
  const left = alive(room)
  if (left.length > 1 || (left.length === 1 && room.desks.length === 1)) return []
  room.phase = 'over'
  room.winner = left[0]?.id ?? null
  for (const desk of left) desk.place = 1
  return [{ type: 'over', winner: room.winner }]
}

function checkRound(room: Room): RoomEvent[] {
  if (room.phase !== 'typing') return []
  const left = alive(room)
  if (!left.every(desk => desk.done && !desk.roll)) return []
  if (left.length > 1 && !room.lastCut) {
    room.lastCut = true
    const last = left.reduce((a, b) => (b.finishedAs > a.finishedAs ? b : a))
    return startRoll(room, last, 'last')
  }
  room.phase = 'break'
  room.breakLeft = BREAK_MS
  return [{ type: 'break', round: room.round }]
}

export function press(room: Room, id: number, key: string, settle = true): RoomEvent[] {
  const desk = deskById(room, id)
  const line = currentLine(room, desk)
  if (room.phase !== 'typing' || desk.done || desk.roll || desk.slips >= SLIPS_TO_ROLL || !line) return []
  const expected = line.text[desk.pos]!
  if (key !== expected) {
    if (desk.missed) return []
    desk.missed = true
    desk.slips++
    const events: RoomEvent[] = [{ type: 'slip', desk: id }]
    if (settle && desk.slips >= SLIPS_TO_ROLL) events.push(...startRoll(room, desk, 'slips'))
    return events
  }
  desk.pos++
  desk.missed = false
  const events: RoomEvent[] = [{ type: 'hit', desk: id }]
  if (desk.pos < line.text.length) return events
  desk.linesTyped++
  desk.lineIdx++
  desk.pos = 0
  desk.lineLeft = LINE_MS
  if (desk.lineIdx < room.lines.length) return [...events, { type: 'line', desk: id }]
  desk.done = true
  desk.finishedAs = ++room.finished
  return [...events, { type: 'finished', desk: id }, ...(settle ? checkRound(room) : [])]
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
    if (room.phase !== 'typing') return events
    if (desk.roll) {
      desk.roll.elapsed += ms
      if (desk.roll.elapsed >= ROLL_MS) events.push(...resolveRoll(room, desk))
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
