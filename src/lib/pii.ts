/**
 * Personal-information detection (Korean context). Used to warn a poster
 * before publishing and to mask agent/MCP read outputs. Heuristic by design:
 * it errs toward flagging in the composer (the poster can still choose to
 * post) and toward masking in agent outputs.
 */
type PiiKind = 'phone' | 'email' | 'rrn' | 'card' | 'address'

const PII_LABEL: Record<PiiKind, string> = {
  phone: '전화번호',
  email: '이메일 주소',
  rrn: '주민등록번호',
  card: '카드 번호',
  address: '주소',
}

const RE: Record<PiiKind, RegExp> = {
  // 주민등록번호 / 외국인등록번호: YYMMDD-[1-8]XXXXXX
  rrn: /(?<!\d)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\s?[-–]\s?[1-8]\d{6}(?!\d)/g,
  // 13–16 digit card numbers in 4-digit groups (Luhn-checked below)
  card: /(?<!\d)(?:\d{4}[ -]?){3}\d{1,4}(?!\d)/g,
  // KR mobile/landline/+82
  phone: /(?<![\d.])(?:\+82[ -]?1[016789]|01[016789]|0(?:2|[3-6][1-5]|70))[ -.]?\d{3,4}[ -.]?\d{4}(?![\d])/g,
  email: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  // 도로명(…로/길 + 번호) or 지번(…동 + 번지/숫자-숫자), optionally with 동·호
  address: /(?:[가-힣]{1,10}(?:시|도)\s)?[가-힣]{1,10}(?:구|군|시)\s[가-힣0-9]{1,20}(?:로|길)\s?\d{1,4}(?:-\d{1,4})?(?:\s?\d{1,4}동)?(?:\s?\d{1,5}호)?|[가-힣]{1,10}동\s\d{1,5}(?:-\d{1,5})?\s?번지|\d{1,4}동\s?\d{1,5}호/g,
}

function luhn(digits: string): boolean {
  let sum = 0
  let alt = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48
    if (alt) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    alt = !alt
  }
  return sum % 10 === 0
}

type PiiHit = { kind: PiiKind; match: string; index: number }

const ORDER: PiiKind[] = ['rrn', 'card', 'phone', 'email', 'address']

function findPii(text: string): PiiHit[] {
  if (!text) return []
  const hits: PiiHit[] = []
  const taken: Array<[number, number]> = []
  const overlaps = (a: number, b: number) => taken.some(([x, y]) => a < y && b > x)
  for (const kind of ORDER) {
    for (const m of text.matchAll(RE[kind])) {
      const s = m.index ?? 0
      const e = s + m[0].length
      if (overlaps(s, e)) continue
      if (kind === 'card') {
        const d = m[0].replace(/\D/g, '')
        if (d.length < 13 || d.length > 16 || !luhn(d)) continue
      }
      hits.push({ kind, match: m[0], index: s })
      taken.push([s, e])
    }
  }
  return hits.sort((a, b) => a.index - b.index)
}

export function detectPii(text: string): PiiKind[] {
  return [...new Set(findPii(text).map((h) => h.kind))]
}

/** Warning line for the composer, e.g. "전화번호, 이메일 주소가 포함돼 있어요." */
export function piiWarning(text: string): string | null {
  const kinds = detectPii(text)
  if (!kinds.length) return null
  return `${kinds.map((k) => PII_LABEL[k]).join(', ')}${kinds.length > 1 ? '가' : /[가-힣]$/.test(PII_LABEL[kinds[0]]) && hasBatchim(PII_LABEL[kinds[0]]) ? '이' : '가'} 포함돼 있는 것 같아요.`
}
function hasBatchim(word: string): boolean {
  const c = word.charCodeAt(word.length - 1)
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0
}

const MASK: Record<PiiKind, string> = {
  phone: '[전화번호 가림]',
  email: '[이메일 가림]',
  rrn: '[주민번호 가림]',
  card: '[카드번호 가림]',
  address: '[주소 가림]',
}

export function maskPii(text: string): string {
  const hits = findPii(text)
  if (!hits.length) return text
  let out = ''
  let i = 0
  for (const h of hits) {
    out += text.slice(i, h.index) + MASK[h.kind]
    i = h.index + h.match.length
  }
  return out + text.slice(i)
}

/** Keys whose string values are structural (ids, times, urls) and never masked. */
const SKIP_KEYS = new Set(['id', 'url', 'link_url', 'image_url', 'page', 'avatar_url', 'avatarUrl', 'createdAt', 'created_at', 'startsAt', 'endsAt', 'starts_at', 'ends_at', 'slug', 'handle', 'trust', 'kind', 'status', 'mode'])

/** Deep-mask every member-written string in an agent-facing payload. */
export function maskPiiDeep<T>(value: T, key = ''): T {
  if (typeof value === 'string') return (SKIP_KEYS.has(key) || /Id$|_id$/.test(key) ? value : maskPii(value)) as T
  if (Array.isArray(value)) return value.map((v) => maskPiiDeep(v, key)) as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = maskPiiDeep(v, k)
    return out as T
  }
  return value
}
