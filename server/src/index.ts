import type { Env } from './host'

export { RoomHost } from './host'

export default {
  async fetch(request, env) {
    const match = new URL(request.url).pathname.match(/^\/room\/([a-z0-9]{4,12})$/)
    if (!match) return new Response('bomb desk rooms live at /room/<code>', { status: 404 })
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('expected a websocket', { status: 426 })
    const origin = request.headers.get('Origin')
    if (origin && !env.ORIGINS.split(',').includes(origin)) return new Response('forbidden', { status: 403 })
    return env.ROOMS.get(env.ROOMS.idFromName(match[1]!)).fetch(request)
  },
} satisfies ExportedHandler<Env>
