/** Fields that stay in the DB but never reach agents (A16: posts.authorship is unused). */
const HIDDEN_KEYS = new Set(['authorship'])

export function omitHiddenDeep<T>(v: T): T {
  if (Array.isArray(v)) return v.map(omitHiddenDeep) as T
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (!HIDDEN_KEYS.has(k)) out[k] = omitHiddenDeep(x)
    return out as T
  }
  return v
}
