import type { Line } from './lines'
import type { Desk, Roll, Room, RoomEvent } from './room'

export const NAME_LENGTH = 16
export const KICKED = 4001

export interface Person {
  id: number
  name: string
  desk: number | null
  away: boolean
}

export interface DeskView {
  id: number
  human: boolean
  name: string
  lineIdx: number
  pos: number
  lineLeft: number
  linesTyped: number
  slips: number
  missed: boolean
  cut: number[]
  roll: Roll | null
  done: boolean
  finishedAs: number
  out: boolean
  place: number
}

export interface RoomView {
  round: number
  lines: Line[]
  phase: Room['phase']
  breakLeft: number
  lastCut: boolean
  winner: number | null
  level: number
  desks: DeskView[]
}

export type ClientMessage =
  | { t: 'join'; player: string; name?: string }
  | { t: 'name'; name: string }
  | { t: 'setup'; bots?: number | null; level?: number }
  | { t: 'start'; bots?: number; level?: number }
  | { t: 'kick'; who: number }
  | { t: 'key'; k: string; s: number }

export type ServerMessage =
  | { t: 'lobby'; host: boolean; you: number; people: number; names: string[]; who: Person[]; bots: number; level: number; playing: boolean }
  | { t: 'state'; game: number; you: number | null; ack: number; view: RoomView; events: RoomEvent[] }

export function cleanName(name: unknown) {
  if (typeof name !== 'string') return ''
  const flat = name.replace(/\p{C}/gu, '').replace(/\s+/g, ' ').trim()
  return [...flat].slice(0, NAME_LENGTH).join('').trim()
}

export function viewOf(room: Room, people: Map<number, string>, level: number): RoomView {
  return {
    round: room.round,
    lines: room.lines,
    phase: room.phase,
    breakLeft: room.breakLeft,
    lastCut: room.lastCut,
    winner: room.winner,
    level,
    desks: room.desks.map(desk => ({
      id: desk.id,
      human: people.has(desk.id),
      name: people.get(desk.id) ?? '',
      lineIdx: desk.lineIdx,
      pos: desk.pos,
      lineLeft: desk.lineLeft,
      linesTyped: desk.linesTyped,
      slips: desk.slips,
      missed: desk.missed,
      cut: [...desk.cut],
      roll: desk.roll && { ...desk.roll },
      done: desk.done,
      finishedAs: desk.finishedAs,
      out: desk.out,
      place: desk.place,
    })),
  }
}

export function mirrorOf(view: RoomView): Room {
  const room: Room = {
    rng: Math.random,
    deck: [],
    round: 0,
    lines: [],
    desks: [],
    phase: 'typing',
    breakLeft: 0,
    finished: 0,
    lastCut: false,
    winner: null,
  }
  applyView(room, view)
  return room
}

export function applyView(room: Room, view: RoomView) {
  const text = (lines: Line[]) => lines.map(line => line.text).join('\n')
  room.round = view.round
  if (text(room.lines) !== text(view.lines)) room.lines = view.lines
  room.phase = view.phase
  room.breakLeft = view.breakLeft
  room.lastCut = view.lastCut
  room.winner = view.winner
  room.finished = Math.max(0, ...view.desks.map(desk => desk.finishedAs))
  room.desks = view.desks.map((desk): Desk => ({ ...desk, missed: desk.missed ?? false, cut: [...desk.cut], roll: desk.roll && { ...desk.roll }, live: -1 }))
}
