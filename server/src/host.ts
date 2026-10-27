import { DurableObject } from 'cloudflare:workers'
import { addBot, driveBots, dropBot, makeBots, NORMAL, pickLevel, type Bots } from '../../src/game/bots'
import { cleanName, KICKED, viewOf, type ClientMessage, type Person, type ServerMessage } from '../../src/game/protocol'
import { advance, createRoom, deskById, press, type Room, type RoomEvent } from '../../src/game/room'
import { MIN_DESKS } from '../../src/game/rules'

export interface Env {
  ROOMS: DurableObjectNamespace<RoomHost>
  ORIGINS: string
}

const SEAT_ORDER = [4, 2, 6, 8, 1, 3, 5, 7]
const TICK_MS = 50
const SYNC_MS = 250
const BURST = 8
const KEYS_PER_SECOND = 20
const MAX_SOCKETS = 32
const STALE_MS = 10_000
const SWEEP_MS = 1_000

interface Tag {
  player: string
  name: string
  joinedAt: number
  setup?: Setup
}

interface Setup {
  bots: number | null
  level: number
}

interface Bucket {
  tokens: number
  at: number
}

interface Game {
  id: number
  room: Room
  bots: Bots
  seats: Map<string, number>
  names: Map<number, string>
  acks: Map<string, number>
  buckets: Map<string, Bucket>
  events: RoomEvent[]
  last: number
  synced: number
}

export class RoomHost extends DurableObject<Env> {
  game: Game | null = null
  timer: ReturnType<typeof setInterval> | null = null
  swept = 0

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
  }

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
    if (msg.t === 'join') return this.join(ws, msg.player, msg.name)
    const tag = this.tag(ws)
    if (!tag) return
    if (msg.t === 'name') return this.rename(ws, tag, msg.name)
    if (msg.t === 'setup') return this.setup(ws, tag, msg.bots, msg.level)
    if (msg.t === 'start') return this.start(ws, msg.bots, msg.level)
    if (msg.t === 'kick') return this.kick(ws, msg.who)
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

  stale(ws: WebSocket, now: number) {
    const seen = this.ctx.getWebSocketAutoResponseTimestamp(ws)
    return !!seen && now - seen.getTime() > STALE_MS
  }

  playing() {
    return !!this.game && this.game.room.phase !== 'over'
  }

  join(ws: WebSocket, player: unknown, name: unknown) {
    if (typeof player !== 'string' || !/^[a-z0-9]{8,32}$/.test(player) || this.tag(ws)) return
    if (this.joined().length >= MAX_SOCKETS) return ws.close(1013, 'room full')
    for (const other of this.joined()) if (this.tag(other)!.player === player) other.close(1000, 'replaced')
    ws.serializeAttachment({ player, name: cleanName(name), joinedAt: Date.now() } satisfies Tag)
    const game = this.game
    const desk = game?.seats.get(player)
    if (game && desk !== undefined) {
      game.acks.set(player, 0)
      game.names.set(desk, cleanName(name))
      if (!deskById(game.room, desk).out) dropBot(game.bots, desk)
    }
    this.lobby()
    if (game) this.send(ws, game)
  }

  rename(ws: WebSocket, tag: Tag, raw: unknown) {
    const name = cleanName(raw)
    if (name === tag.name) return
    ws.serializeAttachment({ ...tag, name } satisfies Tag)
    const desk = this.game?.seats.get(tag.player)
    if (desk !== undefined) this.game!.names.set(desk, name)
    this.lobby()
  }

  setup(ws: WebSocket, tag: Tag, bots: unknown, level: unknown) {
    if (this.joined()[0] !== ws) return
    const count = typeof bots === 'number' && Number.isInteger(bots) ? Math.min(Math.max(bots, 0), SEAT_ORDER.length) : null
    ws.serializeAttachment({ ...tag, setup: { bots: count, level: pickLevel(level) } } satisfies Tag)
    this.lobby()
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

  kick(ws: WebSocket, who: unknown) {
    const people = this.joined()
    if (people[0] !== ws) return
    for (const other of people) {
      const tag = this.tag(other)!
      if (other === ws || tag.joinedAt !== who) continue
      const game = this.game
      const desk = game?.seats.get(tag.player)
      if (game && desk !== undefined) {
        game.seats.delete(tag.player)
        game.names.delete(desk)
        if (!deskById(game.room, desk).out) addBot(game.bots, desk)
      }
      other.close(KICKED, 'kicked')
      this.leave(other)
    }
  }

  sweep(now: number) {
    this.swept = now
    for (const ws of this.joined()) {
      if (!this.stale(ws, now)) continue
      ws.close(4000, 'timed out')
      this.leave(ws)
    }
  }

  start(ws: WebSocket, bots: unknown, level: unknown) {
    const people = this.joined()
    if (people[0] !== ws || this.playing()) return
    const humans = people.slice(0, SEAT_ORDER.length)
    const open = SEAT_ORDER.length - humans.length
    const count = typeof bots === 'number' && Number.isInteger(bots) ? Math.min(Math.max(bots, 0), open) : open
    if (humans.length + count < MIN_DESKS) return
    const seed = crypto.getRandomValues(new Uint32Array(1))[0]!
    const seats = new Map(humans.map((other, i) => [this.tag(other)!.player, SEAT_ORDER[i]!]))
    const botDesks = SEAT_ORDER.slice(humans.length, humans.length + count)
    const now = Date.now()
    this.game = {
      id: now,
      room: createRoom(seed, [...seats.values(), ...botDesks].sort((a, b) => a - b)),
      bots: makeBots(seed, botDesks, pickLevel(level)),
      seats,
      names: new Map(humans.map((other, i) => [SEAT_ORDER[i]!, this.tag(other)!.name ?? ''])),
      acks: new Map(),
      buckets: new Map(),
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
    const bucket = game.buckets.get(player) ?? { tokens: BURST, at: now }
    bucket.tokens = Math.min(BURST, bucket.tokens + ((now - bucket.at) * KEYS_PER_SECOND) / 1000)
    bucket.at = now
    game.buckets.set(player, bucket)
    if (bucket.tokens < 1) return
    bucket.tokens--
    game.events.push(...press(game.room, desk, key))
  }

  tick() {
    const now = Date.now()
    if (now - this.swept >= SWEEP_MS) this.sweep(now)
    const game = this.game
    if (!game) return this.stop()
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
    const view = viewOf(game.room, game.names, game.bots.level)
    this.post(ws, { t: 'state', game: game.id, you: game.seats.get(player) ?? null, ack: game.acks.get(player) ?? 0, view, events: game.events })
  }

  lobby() {
    const people = this.joined()
    const now = Date.now()
    const who = people.map((ws): Person => {
      const tag = this.tag(ws)!
      return { id: tag.joinedAt, name: tag.name ?? '', desk: this.game?.seats.get(tag.player) ?? null, away: this.stale(ws, now) }
    })
    const names = who.map(person => person.name)
    const setup = people[0] && this.tag(people[0])!.setup
    const open = SEAT_ORDER.length - Math.min(people.length, SEAT_ORDER.length)
    const bots = Math.min(setup?.bots ?? open, open)
    const level = setup?.level ?? NORMAL
    people.forEach((ws, you) =>
      this.post(ws, { t: 'lobby', host: you === 0, you, people: people.length, names, who, bots, level, playing: this.playing() }),
    )
  }

  post(ws: WebSocket, msg: ServerMessage) {
    try {
      ws.send(JSON.stringify(msg))
    } catch {}
  }
}
