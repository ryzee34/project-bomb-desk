import { NORMAL } from '../game/bots'
import { applyView, KICKED, mirrorOf, type ClientMessage, type Person, type ServerMessage } from '../game/protocol'
import { press, type Room, type RoomEvent } from '../game/room'
import type { Play } from './play'

export interface Lobby {
  host: boolean
  you: number
  people: number
  who: Person[]
  bots: number | null
  level: number
  playing: boolean
}

export interface Table {
  setup(bots: number | null, level: number): void
  start(bots: number, level: number): void
  rename(name: string): void
  kick(who: number): void
  leave(): void
}

const PING_MS = 3_000

type State = Extract<ServerMessage, { t: 'state' }>

const PREDICTED = new Set<RoomEvent['type']>(['hit', 'slip', 'line', 'finished'])

class Mirror implements Play {
  room: Room
  you: number | null
  humans = new Set<number>()
  names = new Map<number, string>()
  level = NORMAL
  game: number
  seq = 0
  pending: { s: number; k: string }[] = []
  queue: RoomEvent[] = []

  constructor(
    msg: State,
    private send: (msg: ClientMessage) => void,
  ) {
    this.room = mirrorOf(msg.view)
    this.you = msg.you
    this.game = msg.game
    this.sync(msg)
  }

  press(key: string) {
    if (this.you === null) return []
    const events = press(this.room, this.you, key, false)
    if (!events.length) return []
    this.pending.push({ s: ++this.seq, k: key })
    this.send({ t: 'key', k: key, s: this.seq })
    return events
  }

  tick(ms: number) {
    const room = this.room
    for (const desk of room.desks) {
      if (desk.roll) desk.roll.elapsed += ms
      else if (room.phase === 'typing' && !desk.done) desk.lineLeft = Math.max(0, desk.lineLeft - ms)
    }
    if (room.phase === 'break') room.breakLeft = Math.max(0, room.breakLeft - ms)
    return this.queue.splice(0)
  }

  sync(msg: State) {
    applyView(this.room, msg.view)
    this.you = msg.you
    const humans = msg.view.desks.filter(desk => desk.human)
    this.humans = new Set(humans.map(desk => desk.id))
    this.names = new Map(humans.map(desk => [desk.id, desk.name ?? '']))
    this.level = msg.view.level ?? NORMAL
    this.pending = this.pending.filter(key => key.s > msg.ack)
    if (this.you !== null) for (const key of this.pending) press(this.room, this.you, key.k, false)
    this.queue.push(...msg.events.filter(event => !('desk' in event && event.desk === this.you && PREDICTED.has(event.type))))
  }

  reset() {
    this.seq = 0
    this.pending = []
  }
}

export function joinRoom(
  url: string,
  code: string,
  player: string,
  name: () => string,
  on: { lobby(lobby: Lobby): void; game(play: Play): void; lost(): void; back(): void; kicked(): void },
): Table {
  let ws: WebSocket
  let mirror: Mirror | null = null
  let left = false
  let tries = 0
  let pinged = 0
  let pinger = 0

  const send = (msg: ClientMessage) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
  }

  const ping = () => {
    if (ws.readyState !== WebSocket.OPEN) return
    ws.send('ping')
    pinged = Date.now()
  }

  function open() {
    ws = new WebSocket(`${url}/room/${code}`)
    ws.onopen = () => {
      tries = 0
      mirror?.reset()
      send({ t: 'join', player, name: name() })
      clearInterval(pinger)
      pinger = window.setInterval(ping, PING_MS)
      ping()
      on.back()
    }
    ws.onmessage = e => {
      if (e.data === 'pong') return
      if (Date.now() - pinged > PING_MS) ping()
      const msg: ServerMessage = JSON.parse(e.data)
      if (msg.t === 'lobby')
        return on.lobby({
          host: msg.host,
          you: msg.you ?? 0,
          people: msg.people,
          who: msg.who ?? (msg.names ?? []).map(name => ({ id: 0, name, desk: null, away: false })),
          bots: msg.bots ?? null,
          level: msg.level ?? NORMAL,
          playing: msg.playing,
        })
      if (mirror && mirror.game === msg.game) return mirror.sync(msg)
      mirror = new Mirror(msg, send)
      on.game(mirror)
    }
    ws.onclose = e => {
      clearInterval(pinger)
      if (left) return
      if (e.code === KICKED) {
        left = true
        return on.kicked()
      }
      on.lost()
      if (tries++ < 20) setTimeout(open, Math.min(1000 * tries, 5000))
    }
  }

  open()
  return {
    setup: (bots, level) => send({ t: 'setup', bots, level }),
    start: (bots, level) => send({ t: 'start', bots, level }),
    rename: next => send({ t: 'name', name: next }),
    kick: who => send({ t: 'kick', who }),
    leave() {
      left = true
      clearInterval(pinger)
      ws.close()
    },
  }
}
