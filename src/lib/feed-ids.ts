import { isMock } from '@/lib/data/client'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** UUID in production; DEV mock ids ("post-1") are accepted only in mock mode. */
export function isFeedId(id: string): boolean {
  return UUID_RE.test(id) || (isMock() && /^[a-z0-9-]{1,64}$/i.test(id))
}
