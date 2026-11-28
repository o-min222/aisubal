/**
 * SSRF-safe HTTP(S) fetch for server-side page snapshots (tool review queue,
 * link previews).
 *
 *  - http/https only, default ports only, no credentials in the URL
 *  - hostnames must be public: no localhost/.local/.internal or single-label names
 *  - every DNS answer is checked against private, loopback, link-local, CGNAT,
 *    multicast and reserved ranges INSIDE the socket's lookup, so the address we
 *    connect to is the one we checked (no DNS-rebinding window)
 *  - redirects are followed by hand (max 4) and every hop is re-checked
 *  - 6 s timeout, 512 KB body cap, no cookies, no auth headers, identity encoding
 */
import { lookup as dnsLookup, type LookupAddress } from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'

const SAFE_FETCH_UA = 'AIsubalReviewBot/1.0 (+https://aisubal.vercel.app; page snapshot for human/admin review)'
const MAX_BYTES = 512 * 1024
const TIMEOUT_MS = 6000
const MAX_REDIRECTS = 4

function v4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0
}
const V4_BLOCKS: Array<[string, number]> = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
]
function v4Blocked(ip: string): boolean {
  const n = v4ToInt(ip)
  return V4_BLOCKS.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0
    return (n & mask) === (v4ToInt(base) & mask)
  })
}

/** Expand an IPv6 address to 8 numeric hextets (handles :: and embedded IPv4). */
function expandIpv6(ip: string): number[] | null {
  let s = ip.toLowerCase().split('%')[0]
  const v4 = s.match(/(\d+\.\d+\.\d+\.\d+)$/)
  if (v4) {
    if (!net.isIPv4(v4[1])) return null
    const n = v4ToInt(v4[1])
    s = s.slice(0, -v4[1].length) + `${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`
  }
  const halves = s.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0
  if (fill < 0) return null
  const parts = [...head, ...Array(fill).fill('0'), ...tail]
  if (parts.length !== 8) return null
  const out = parts.map((p) => parseInt(p, 16))
  return out.some((x) => Number.isNaN(x) || x < 0 || x > 0xffff) ? null : out
}

/** True when the address must never be fetched from the server. */
export function isBlockedIp(ip: string): boolean {
  const raw = ip.replace(/^\[|\]$/g, '')
  if (net.isIPv4(raw)) return v4Blocked(raw)
  if (!net.isIPv6(raw)) return true
  const h = expandIpv6(raw)
  if (!h) return true
  // IPv4-mapped ::ffff:a.b.c.d → judge the IPv4 address
  if (h.slice(0, 5).every((x) => x === 0) && h[5] === 0xffff) {
    return v4Blocked(`${h[6] >> 8}.${h[6] & 255}.${h[7] >> 8}.${h[7] & 255}`)
  }
  // only global unicast 2000::/3 is allowed …
  if ((h[0] & 0xe000) !== 0x2000) return true
  // … minus documentation, Teredo, 6to4 and ORCHID/benchmark ranges
  if (h[0] === 0x2001 && (h[1] === 0x0db8 || h[1] === 0 || (h[1] & 0xfff0) === 0x0010 || h[1] === 0x0002)) return true
  if (h[0] === 0x2002) return true
  return false
}

const BLOCKED_SUFFIX = ['.localhost', '.local', '.internal', '.lan', '.home', '.home.arpa', '.intranet', '.corp', '.localdomain']

type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string }

export function checkFetchUrl(raw: string | URL): UrlCheck {
  let u: URL
  try {
    u = typeof raw === 'string' ? new URL(raw.trim()) : raw
  } catch {
    return { ok: false, reason: 'invalid_url' }
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, reason: 'scheme_not_allowed' }
  if (u.username || u.password) return { ok: false, reason: 'credentials_in_url' }
  if (u.port && !((u.protocol === 'http:' && u.port === '80') || (u.protocol === 'https:' && u.port === '443'))) {
    return { ok: false, reason: 'port_not_allowed' }
  }
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  if (!host) return { ok: false, reason: 'invalid_url' }
  if (net.isIP(host)) return isBlockedIp(host) ? { ok: false, reason: 'blocked_address' } : { ok: true, url: u }
  if (host === 'localhost' || BLOCKED_SUFFIX.some((s) => host.endsWith(s)) || !host.includes('.')) {
    return { ok: false, reason: 'blocked_host' }
  }
  return { ok: true, url: u }
}

type LookupCb = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void
function safeLookup(hostname: string, options: { all?: boolean } | number, cb: LookupCb) {
  dnsLookup(hostname, { all: true, verbatim: true }, (err, addrs) => {
    if (err) return cb(err, '')
    const list = addrs as LookupAddress[]
    if (!list.length || list.some((a) => isBlockedIp(a.address))) {
      const e = new Error('blocked_address') as NodeJS.ErrnoException
      e.code = 'EBLOCKED'
      return cb(e, '')
    }
    if (typeof options === 'object' && options?.all) return cb(null, list)
    cb(null, list[0].address, list[0].family)
  })
}

type Raw = { status: number; headers: http.IncomingHttpHeaders; body: Buffer; truncated: boolean }

function requestOnce(u: URL, accept: string, maxBytes = MAX_BYTES): Promise<Raw> {
  const mod = u.protocol === 'https:' ? https : http
  return new Promise((resolve, reject) => {
    let settled = false
    const done = (fn: () => void) => {
      if (!settled) {
        settled = true
        fn()
      }
    }
    const req = mod.request(
      u,
      {
        method: 'GET',
        agent: false,
        lookup: safeLookup as unknown as typeof dnsLookup,
        timeout: TIMEOUT_MS,
        headers: { 'user-agent': SAFE_FETCH_UA, accept, 'accept-language': 'ko,en;q=0.8', 'accept-encoding': 'identity' },
      },
      (res) => {
        const status = res.statusCode || 0
        if (status >= 300 && status < 400) {
          res.resume()
          return done(() => resolve({ status, headers: res.headers, body: Buffer.alloc(0), truncated: false }))
        }
        const chunks: Buffer[] = []
        let size = 0
        let truncated = false
        res.on('data', (c: Buffer) => {
          if (truncated) return
          size += c.length
          if (size > maxBytes) {
            truncated = true
            chunks.push(c.subarray(0, c.length - (size - maxBytes)))
            res.destroy()
            done(() => resolve({ status, headers: res.headers, body: Buffer.concat(chunks), truncated }))
          } else chunks.push(c)
        })
        res.on('end', () => done(() => resolve({ status, headers: res.headers, body: Buffer.concat(chunks), truncated })))
        res.on('error', (e) => done(() => (truncated ? resolve({ status, headers: res.headers, body: Buffer.concat(chunks), truncated }) : reject(e))))
      }
    )
    const hard = setTimeout(() => req.destroy(new Error('timeout')), TIMEOUT_MS + 1000)
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', (e) => done(() => reject(e)))
    req.on('close', () => clearTimeout(hard))
    req.end()
  })
}

/** Errors meaning "this URL points somewhere we must never fetch" (→ HTTP 422). */
export const BLOCKED_FETCH_ERRORS = new Set([
  'blocked_address', 'blocked_host', 'scheme_not_allowed', 'credentials_in_url', 'port_not_allowed', 'invalid_url',
])
export class BlockedUrlError extends Error {
  constructor(public reason: string) {
    super(reason)
    this.name = 'BlockedUrlError'
  }
}

type SafeFetchResult =
  | { ok: true; finalUrl: string; status: number; contentType: string; text: string; truncated: boolean; redirects: string[] }
  | { ok: false; error: string; finalUrl?: string; redirects: string[] }

export async function safeFetchText(raw: string, accept = 'text/html,application/xhtml+xml,text/plain;q=0.8'): Promise<SafeFetchResult> {
  const redirects: string[] = []
  let check = checkFetchUrl(raw)
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!check.ok) return { ok: false, error: check.reason, redirects }
    const u = check.url
    let r: Raw
    try {
      r = await requestOnce(u, accept)
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      return { ok: false, error: code === 'EBLOCKED' ? 'blocked_address' : (e as Error).message === 'timeout' ? 'timeout' : 'fetch_failed', finalUrl: u.toString(), redirects }
    }
    if (r.status >= 300 && r.status < 400) {
      const loc = r.headers.location
      if (!loc) return { ok: false, error: 'redirect_without_location', finalUrl: u.toString(), redirects }
      let next: URL
      try {
        next = new URL(loc, u)
      } catch {
        return { ok: false, error: 'bad_redirect', finalUrl: u.toString(), redirects }
      }
      redirects.push(next.toString())
      check = checkFetchUrl(next)
      continue
    }
    const contentType = String(r.headers['content-type'] || '').toLowerCase()
    const isText = /^(text\/html|application\/xhtml\+xml|text\/plain|application\/json)/.test(contentType) || contentType === ''
    if (!isText) return { ok: true, finalUrl: u.toString(), status: r.status, contentType, text: '', truncated: false, redirects }
    const charset = contentType.match(/charset=([\w-]+)/)?.[1] || 'utf-8'
    let text: string
    try {
      text = new TextDecoder(charset, { fatal: false }).decode(r.body)
    } catch {
      text = new TextDecoder('utf-8').decode(r.body)
    }
    return { ok: true, finalUrl: u.toString(), status: r.status, contentType, text, truncated: r.truncated, redirects }
  }
  return { ok: false, error: 'too_many_redirects', redirects }
}

// ------------------------------------------------------------------ image bytes (A69)
type SafeFetchBytesResult =
  | { ok: true; finalUrl: string; contentType: string; body: Buffer; redirects: string[] }
  | { ok: false; error: string; redirects: string[] }

/**
 * An image the server downloads for an agent (profile_set_avatar url): https on every hop, public
 * addresses only (checked inside the socket lookup), at most 3 redirects, 6 s timeout, and a body
 * over maxBytes is an error rather than a truncated image. The caller still sniffs the bytes.
 */
export async function safeFetchBytes(raw: string, maxBytes: number): Promise<SafeFetchBytesResult> {
  const redirects: string[] = []
  const httpsOnly = (c: UrlCheck): UrlCheck => (c.ok && c.url.protocol !== 'https:' ? { ok: false, reason: 'scheme_not_allowed' } : c)
  let check = httpsOnly(checkFetchUrl(raw))
  for (let hop = 0; hop <= 3; hop++) {
    if (!check.ok) return { ok: false, error: check.reason, redirects }
    const u = check.url
    let r: Raw
    try {
      r = await requestOnce(u, 'image/png,image/jpeg,image/webp;q=0.9', maxBytes)
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      return { ok: false, error: code === 'EBLOCKED' ? 'blocked_address' : (e as Error).message === 'timeout' ? 'timeout' : 'fetch_failed', redirects }
    }
    if (r.status >= 300 && r.status < 400) {
      const loc = r.headers.location
      if (!loc) return { ok: false, error: 'redirect_without_location', redirects }
      let next: URL
      try {
        next = new URL(loc, u)
      } catch {
        return { ok: false, error: 'bad_redirect', redirects }
      }
      redirects.push(next.toString())
      check = httpsOnly(checkFetchUrl(next))
      continue
    }
    if (r.status < 200 || r.status >= 300) return { ok: false, error: `http_${r.status}`, redirects }
    if (r.truncated) return { ok: false, error: 'too_large', redirects }
    return { ok: true, finalUrl: u.toString(), contentType: String(r.headers['content-type'] || '').toLowerCase(), body: r.body, redirects }
  }
  return { ok: false, error: 'too_many_redirects', redirects }
}

// ------------------------------------------------------------------ webhook POST
const WEBHOOK_UA = 'AIsubalWebhook/1.0 (+https://aisubal.vercel.app/skill.md)'

/** https-only variant of checkFetchUrl for agent webhooks. */
export function checkWebhookUrl(raw: string): UrlCheck {
  const c = checkFetchUrl(raw)
  if (!c.ok) return c
  if (c.url.protocol !== 'https:') return { ok: false, reason: 'scheme_not_allowed' }
  if (net.isIP(c.url.hostname.replace(/^\[|\]$/g, ''))) return { ok: false, reason: 'blocked_host' }
  return c
}

/** Resolves the host now and refuses private / reserved answers (save-time check; delivery re-checks at connect). */
export function resolvesPublic(host: string): Promise<boolean> {
  return new Promise((resolve) => {
    dnsLookup(host, { all: true, verbatim: true }, (err, addrs) => {
      const list = (addrs || []) as LookupAddress[]
      resolve(!err && list.length > 0 && !list.some((a) => isBlockedIp(a.address)))
    })
  })
}

type WebhookPostResult = { ok: boolean; status: number | null; error: string | null }

/**
 * One signed webhook POST: https only, no redirects (a 3xx counts as failure),
 * the DNS answer checked inside the socket lookup, 5 s timeout, response body
 * discarded after 8 KB.
 */
export function safeWebhookPost(raw: string, body: string, headers: Record<string, string>): Promise<WebhookPostResult> {
  const check = checkWebhookUrl(raw)
  if (!check.ok) return Promise.resolve({ ok: false, status: null, error: check.reason })
  return new Promise((resolve) => {
    let settled = false
    const done = (r: WebhookPostResult) => {
      if (!settled) {
        settled = true
        resolve(r)
      }
    }
    const req = https.request(
      check.url,
      {
        method: 'POST',
        agent: false,
        lookup: safeLookup as unknown as typeof dnsLookup,
        timeout: 5000,
        headers: { ...headers, 'user-agent': WEBHOOK_UA, 'content-type': 'application/json; charset=utf-8', 'content-length': String(Buffer.byteLength(body)) },
      },
      (res) => {
        const status = res.statusCode || 0
        let size = 0
        res.on('data', (c: Buffer) => {
          size += c.length
          if (size > 8192) res.destroy()
        })
        const fin = () => done({ ok: status >= 200 && status < 300, status, error: status >= 200 && status < 300 ? null : `http_${status}` })
        res.on('end', fin)
        res.on('close', fin)
        res.on('error', fin)
      }
    )
    const hard = setTimeout(() => req.destroy(new Error('timeout')), 6000)
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', (e) => {
      const code = (e as NodeJS.ErrnoException).code
      done({ ok: false, status: null, error: code === 'EBLOCKED' ? 'blocked_address' : e.message === 'timeout' ? 'timeout' : 'connect_failed' })
    })
    req.on('close', () => clearTimeout(hard))
    req.end(body)
  })
}

// ------------------------------------------------------------------ HTML → snapshot
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" }
function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeChar(Number(d)))
    .replace(/&([a-z#0-9]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
}
function safeChar(n: number) {
  return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''
}
const clean = (s: string | null | undefined, max: number) =>
  s ? decodeEntities(s).replace(/\s+/g, ' ').trim().slice(0, max) || null : null

function meta(html: string, key: string): string | null {
  const a = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`, 'i')
  const b = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`, 'i')
  return html.match(a)?.[1] ?? html.match(b)?.[1] ?? null
}

export type PageSnapshot = {
  requestedUrl: string
  finalUrl: string | null
  fetchedAt: string
  status: number | null
  contentType: string | null
  title: string | null
  description: string | null
  siteName: string | null
  headings: string[]
  text: string
  truncated: boolean
  redirects: string[]
  error?: string
}

function htmlToSnapshotParts(html: string, textMax = 3500) {
  const title = clean(meta(html, 'og:title') || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1], 200)
  const description = clean(meta(html, 'og:description') || meta(html, 'description'), 400)
  const siteName = clean(meta(html, 'og:site_name'), 80)
  const body = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe|head)[\s\S]*?<\/\1>/gi, ' ')
  const headings = [...body.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)]
    .map((m) => clean(m[1].replace(/<[^>]+>/g, ' '), 140))
    .filter((x): x is string => Boolean(x))
    .slice(0, 12)
  const text = (clean(body.replace(/<(br|\/p|\/div|\/li|\/h\d)[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' '), textMax) || '')
  return { title, description, siteName, headings, text }
}

/** Fetch a page safely and reduce it to a small, text-only snapshot for reviewers. */
export async function fetchPageSnapshot(url: string): Promise<PageSnapshot> {
  const fetchedAt = new Date().toISOString()
  const r = await safeFetchText(url)
  if (!r.ok) {
    return { requestedUrl: url, finalUrl: r.finalUrl ?? null, fetchedAt, status: null, contentType: null, title: null, description: null, siteName: null, headings: [], text: '', truncated: false, redirects: r.redirects, error: r.error }
  }
  const isHtml = /html|xhtml/.test(r.contentType) || /^\s*<(!doctype|html)/i.test(r.text)
  const parts = isHtml ? htmlToSnapshotParts(r.text) : { title: null, description: null, siteName: null, headings: [], text: r.text.replace(/\s+/g, ' ').slice(0, 3500) }
  return { requestedUrl: url, finalUrl: r.finalUrl, fetchedAt, status: r.status, contentType: r.contentType || null, ...parts, truncated: r.truncated, redirects: r.redirects }
}
