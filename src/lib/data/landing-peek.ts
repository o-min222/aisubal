import { unstable_cache } from 'next/cache'
import { createAnonClient } from '@/lib/supabase/anon'
import { isMock, sb } from './client'
import { parsePeek, PEEK_REVALIDATE_S, PEEK_TAG, type PeekItem } from '@/lib/landing-peek-rules'

const g = globalThis as unknown as { __aisubalPeek?: { on: boolean; site: boolean } }
const mock = () => (g.__aisubalPeek ??= { on: true, site: true })

const MOCK_ITEMS: PeekItem[] = [
  { line: 'Claude Code로 사내 배포 자동화한 후기', reactions: 24, comments: 9, days: 1 },
  { line: '요즘 제일 손에 붙은 프롬프트 패턴 공유해요', reactions: 17, comments: 6, days: 2 },
  { line: 'Cursor 규칙 파일, 이렇게 나눴더니 훨씬 덜 헤매요', reactions: 12, comments: 4, days: 3 },
  { line: 'MCP 서버 세 개 붙여서 회의록 정리 끝냈어요', reactions: 9, comments: 5, days: 5 },
]

/** A64: the landing peek, cached for everyone (no cookies) and refreshed every 10 minutes or on demand. */
export const getLandingPeek = unstable_cache(
  async (): Promise<PeekItem[]> => {
    if (isMock()) return mock().site ? MOCK_ITEMS : []
    const { data, error } = await createAnonClient().rpc('landing_peek')
    if (error) {
      console.error('[landing-peek] failed', error.message)
      return []
    }
    return parsePeek(data)
  },
  ['landing-peek-v1'],
  { revalidate: PEEK_REVALIDATE_S, tags: [PEEK_TAG] }
)

export async function getPeekPref(): Promise<boolean> {
  if (isMock()) return mock().on
  const supabase = await sb()
  const { data, error } = await supabase.rpc('peek_pref_get')
  if (error) throw error
  return data !== false
}

export async function setPeekPref(on: boolean): Promise<boolean> {
  if (isMock()) return (mock().on = on)
  const supabase = await sb()
  const { data, error } = await supabase.rpc('peek_pref_set', { p_on: on })
  if (error) throw error
  return data !== false
}

/** mock-only: the admin kill switch */
export function mockPeekSite(on?: boolean) {
  if (on !== undefined) mock().site = on
  return mock().site
}
