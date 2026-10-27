import type { Line } from './lines'
import type { Desk, Roll, Room, RoomEvent } from './room'

export interface DeskView {
  id: number
  human: boolean
  lineIdx: number
  pos: number
  lineLeft: number
  linesTyped: number
  slips: number
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
  desks: DeskView[]
}

export type ClientMessage = { t: 'join'; player: string } | { t: 'start' } | { t: 'key'; k: string; s: number }

export type ServerMessage =
  | { t: 'lobby'; host: boolean; people: number; playing: boolean }
  | { t: 'state'; you: number | null; ack: number; view: RoomView; events: RoomEvent[] }

export function viewOf(room: Room, humans: Set<number>): RoomView {
  return {
    round: room.round,
    lines: room.lines,
    phase: room.phase,
    breakLeft: room.breakLeft,
    lastCut: room.lastCut,
    winner: room.winner,
    desks: room.desks.map(desk => ({
      id: desk.id,
      human: humans.has(desk.id),
      lineIdx: desk.lineIdx,
      pos: desk.pos,
      lineLeft: desk.lineLeft,
      linesTyped: desk.linesTyped,
      slips: desk.slips,
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
  room.round = view.round
  room.lines = view.lines
  room.phase = view.phase
  room.breakLeft = view.breakLeft
  room.lastCut = view.lastCut
  room.winner = view.winner
  room.finished = Math.max(0, ...view.desks.map(desk => desk.finishedAs))
  room.desks = view.desks.map((desk): Desk => ({ ...desk, cut: [...desk.cut], roll: desk.roll && { ...desk.roll }, live: -1 }))
}
