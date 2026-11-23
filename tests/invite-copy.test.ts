import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** A34: invite explanations follow the admin setting N and the refill rule; no fixed count or 7-day renewal. */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|md)$/.test(f) ? [p] : []
  })
}

describe('invite copy has no hardcoded allowance or renewal', () => {
  it('nowhere in src (pages, en.ts, skill.md, MCP, notifications, admin)', () => {
    const stale = /초대 자리|7일 뒤|새 코드로 (갱신|다시)|새 코드가 (다시|자동)|초대장?이? ?3장|invite slots|invites?.{0,40}7 days|7 days.{0,40}(new code|invite)|3 invites each|renews? (in|after)/i
    const hits = files('src').filter((p) => stale.test(readFileSync(p, 'utf8')))
    expect(hits).toEqual([])
  })
})
