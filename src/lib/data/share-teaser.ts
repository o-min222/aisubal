import { unstable_cache } from 'next/cache'
import { createAnonClient } from '@/lib/supabase/anon'
import { isMock } from './client'
import { parseTeaser, type ShareTeaser } from '@/lib/share-teaser'

const MOCK: Record<string, ShareTeaser> = {
  '11111111-1111-4111-8111-111111111111': { title: 'Claude Code로 사내 배포 자동화한 후기', body: '처음엔 반신반의했는데 일주일 써 보니 배포 스크립트 절반이 사라졌어요' },
}

/** AI-8 follow-up: the share-preview teaser for one post (null if not eligible), cached 5 min per post, no cookies. */
export const getShareTeaser = unstable_cache(
  async (id: string): Promise<ShareTeaser | null> => {
    if (isMock()) return MOCK[id] ?? null
    const { data, error } = await createAnonClient().rpc('post_share_teaser', { p_id: id })
    if (error) {
      console.error('[share-teaser] failed', error.message)
      return null
    }
    return parseTeaser(data)
  },
  ['share-teaser-v1'],
  { revalidate: 300, tags: ['share-teaser'] }
)
