const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

function random(length: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return [...bytes].map(b => ALPHABET[b % ALPHABET.length]).join('')
}

export function newCode() {
  return random(6)
}

export function playerId() {
  try {
    const saved = sessionStorage.getItem('bomb-desk-player')
    if (saved) return saved
    const id = random(16)
    sessionStorage.setItem('bomb-desk-player', id)
    return id
  } catch {
    return random(16)
  }
}

export function savedName() {
  try {
    return localStorage.getItem('bomb-desk-name') ?? ''
  } catch {
    return ''
  }
}

export function saveName(name: string) {
  try {
    localStorage.setItem('bomb-desk-name', name)
  } catch {}
}

export function savedLevel() {
  try {
    return Number(localStorage.getItem('bomb-desk-level') ?? NaN)
  } catch {
    return NaN
  }
}

export function saveLevel(level: number) {
  try {
    localStorage.setItem('bomb-desk-level', String(level))
  } catch {}
}

export function roomFromUrl() {
  const code = new URLSearchParams(location.search).get('room')?.toLowerCase() ?? ''
  return /^[a-z0-9]{4,12}$/.test(code) ? code : null
}

export function roomLink(code: string | null) {
  const url = new URL(location.href)
  url.search = ''
  url.hash = ''
  if (code) url.searchParams.set('room', code)
  return url.toString()
}

export function setRoomInUrl(code: string | null) {
  history.replaceState(null, '', roomLink(code))
}
