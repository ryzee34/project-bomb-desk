import { DurableObject } from 'cloudflare:workers'
import { addBot, driveBots, dropBot, makeBots, type Bots } from '../../src/game/bots'
import { viewOf, type ClientMessage, type ServerMessage } from '../../src/game/protocol'
import { advance, createRoom, deskById, press, type Room, type RoomEvent } from '../../src/game/room'
import { DESKS } from '../../src/game/rules'

export interface Env {
  ROOMS: DurableObjectNamespace<RoomHost>
  ORIGINS: string
}

const SEAT_ORDER = [4, 2, 6, 8, 1, 3, 5, 7]
const TICK_MS = 50
const SYNC_MS = 250
const MIN_KEY_MS = 35
const MAX_SOCKETS = 32

interface Tag {
  player: string
  joinedAt: number
}

interface Game {
  room: Room
  bots: Bots
  seats: Map<string, number>
  acks: Map<string, number>
  lastKey: Map<string, number>
  events: RoomEvent[]
  last: number
  synced: number
}

export class RoomHost extends DurableObject<Env> {
  game: Game | null = null
  timer: ReturnType<typeof setInterval> | null = null

  override async fetch() {
    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket]
    this.ctx.acceptWebSocket(server)
    return new Response(null, { status: 101, webSocket: client })
  }

  override async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer) {
    if (typeof data !== 'string' || data.length > 200) return
    let msg: ClientMessage
    try {
      msg = JSON.parse(data)
    } catch {
      return
    }
    if (msg.t === 'join') return this.join(ws, msg.player)
    const tag = this.tag(ws)
    if (!tag) return
    if (msg.t === 'start') return this.start(ws)
    if (msg.t === 'key') return this.key(tag.player, msg.k, msg.s)
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string) {
    try {
      ws.close(code, reason)
    } catch {}
    this.leave(ws)
  }

  override async webSocketError(ws: WebSocket) {
    this.leave(ws)
  }

  tag(ws: WebSocket): Tag | null {
    return ws.deserializeAttachment() ?? null
  }

  joined() {
    return this.ctx
      .getWebSockets()
      .filter(ws => ws.readyState === WebSocket.OPEN && this.tag(ws))
      .sort((a, b) => this.tag(a)!.joinedAt - this.tag(b)!.joinedAt)
  }

  playing() {
    return !!this.game && this.game.room.phase !== 'over'
  }

  join(ws: WebSocket, player: unknown) {
    if (typeof player !== 'string' || !/^[a-z0-9]{8,32}$/.test(player) || this.tag(ws)) return
    if (this.joined().length >= MAX_SOCKETS) return ws.close(1013, 'room full')
    for (const other of this.joined()) if (this.tag(other)!.player === player) other.close(1000, 'replaced')
    ws.serializeAttachment({ player, joinedAt: Date.now() } satisfies Tag)
    const game = this.game
    const desk = game?.seats.get(player)
    if (game && desk !== undefined) {
      game.acks.set(player, 0)
      if (!deskById(game.room, desk).out) dropBot(game.bots, desk)
    }
    this.lobby()
    if (game) this.send(ws, game)
  }

  leave(ws: WebSocket) {
    const tag = this.tag(ws)
    ws.serializeAttachment(null)
    const game = this.game
    if (tag && game) {
      const desk = game.seats.get(tag.player)
      const stillHere = this.joined().some(other => this.tag(other)!.player === tag.player)
      if (desk !== undefined && !stillHere) addBot(game.bots, desk)
    }
    if (!this.joined().length) this.stop()
    else this.lobby()
  }

  start(ws: WebSocket) {
    const people = this.joined()
    if (people[0] !== ws || this.playing()) return
    const seed = crypto.getRandomValues(new Uint32Array(1))[0]!
    const seats = new Map(people.slice(0, SEAT_ORDER.length).map((other, i) => [this.tag(other)!.player, SEAT_ORDER[i]!]))
    const taken = new Set(seats.values())
    const now = Date.now()
    this.game = {
      room: createRoom(seed, DESKS),
      bots: makeBots(seed, DESKS.filter(id => !taken.has(id))),
      seats,
      acks: new Map(),
      lastKey: new Map(),
      events: [],
      last: now,
      synced: 0,
    }
    if (this.timer) clearInterval(this.timer)
    this.timer = setInterval(() => this.tick(), TICK_MS)
    this.lobby()
    this.sync()
  }

  key(player: string, key: unknown, seq: unknown) {
    const game = this.game
    const desk = game?.seats.get(player)
    if (!game || desk === undefined || typeof seq !== 'number') return
    game.acks.set(player, seq)
    if (typeof key !== 'string' || key.length !== 1 || !this.playing()) return
    const now = Date.now()
    if (now - (game.lastKey.get(player) ?? 0) < MIN_KEY_MS) return
    game.lastKey.set(player, now)
    game.events.push(...press(game.room, desk, key))
  }

  tick() {
    const game = this.game
    if (!game) return this.stop()
    const now = Date.now()
    const ms = now - game.last
    game.last = now
    game.events.push(...driveBots(game.room, game.bots, ms), ...advance(game.room, ms))
    if (game.events.length || now - game.synced >= SYNC_MS) this.sync()
    if (game.room.phase === 'over') {
      if (this.timer) clearInterval(this.timer)
      this.timer = null
      this.lobby()
    }
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.game = null
  }

  sync() {
    const game = this.game
    if (!game) return
    game.synced = Date.now()
    for (const ws of this.joined()) this.send(ws, game)
    game.events = []
  }

  send(ws: WebSocket, game: Game) {
    const player = this.tag(ws)!.player
    const view = viewOf(game.room, new Set(game.seats.values()))
    this.post(ws, { t: 'state', you: game.seats.get(player) ?? null, ack: game.acks.get(player) ?? 0, view, events: game.events })
  }

  lobby() {
    const people = this.joined()
    for (const ws of people) this.post(ws, { t: 'lobby', host: ws === people[0], people: people.length, playing: this.playing() })
  }

  post(ws: WebSocket, msg: ServerMessage) {
    try {
      ws.send(JSON.stringify(msg))
    } catch {}
  }
}
