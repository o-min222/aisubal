import { describe, it, expect, beforeEach } from 'vitest'
import {
  canonicalUrl,
  upsertByCanonicalUrl,
  recordMention,
  upsertReview,
  recomputeRating,
  sortEntries,
  isToolishUrl,
} from '@/lib/toolbox-rules'
import { resetToolboxStore, MUTABLE_TOOLBOX, listToolbox } from '@/lib/mock-toolbox'
import type { ToolboxEntry } from '@/lib/supabase/types'

function blankEntry(
  overrides: Partial<ToolboxEntry> & Pick<ToolboxEntry, 'name' | 'canonical_url' | 'slug'>
): Omit<ToolboxEntry, 'id' | 'created_at' | 'updated_at'> & {
  id?: string
} {
  return {
    one_liner: 'x',
    description: 'x',
    type: 'mcp_server',
    tags: [],
    icon_url: null,
    github_url: overrides.canonical_url,
    homepage_url: null,
    license: 'MIT',
    last_commit_at: null,
    source_repo: null,
    install_snippets: {},
    mention_count: 0,
    install_count: 0,
    avg_rating: 0,
    rating_count: 0,
    created_by_id: null,
    featured: false,
    ...overrides,
  }
}

describe('툴박스 canonical URL / 멘션 / 리뷰', () => {
  beforeEach(() => {
    resetToolboxStore()
  })

  it('GitHub URL을 정규화해 중복을 제거한다', () => {
    expect(canonicalUrl('https://www.GitHub.com/Upstash/Context7/')).toBe(
      'https://github.com/upstash/context7'
    )
    expect(canonicalUrl('https://github.com/upstash/context7?tab=readme')).toBe(
      'https://github.com/upstash/context7'
    )
  })

  it('같은 canonical URL이면 upsert가 병합된다', () => {
    let entries: ToolboxEntry[] = []
    const first = upsertByCanonicalUrl(
      entries,
      blankEntry({
        name: 'Context7',
        slug: 'context7',
        canonical_url: 'https://github.com/upstash/context7',
        tags: ['문서'],
      })
    )
    entries = first.entries
    expect(first.created).toBe(true)

    const second = upsertByCanonicalUrl(
      entries,
      blankEntry({
        name: 'Context7 MCP',
        slug: 'context7-mcp',
        canonical_url: 'https://github.com/upstash/context7/',
        tags: ['코딩'],
        one_liner: 'updated',
      })
    )
    expect(second.created).toBe(false)
    expect(second.entries).toHaveLength(1)
    expect(second.entry.tags.sort()).toEqual(['문서', '코딩'].sort())
  })

  it('게시물 멘션은 동일 post+url에 대해 한 번만 카운트', () => {
    let mentions: ReturnType<typeof recordMention>['mentions'] = []
    const a = recordMention(mentions, 'tool-1', 'post-1', 'https://github.com/github/github-mcp-server')
    mentions = a.mentions
    expect(a.added).toBe(true)
    const b = recordMention(mentions, 'tool-1', 'post-1', 'https://github.com/github/github-mcp-server/')
    expect(b.added).toBe(false)
    expect(b.mentions).toHaveLength(1)
  })

  it('멤버당 리뷰 하나, 별점 재계산', () => {
    const r1 = upsertReview([], 'tool-1', 'member-1', 5, '좋음')
    expect(r1.ok).toBe(true)
    if (!r1.ok) return
    const r2 = upsertReview(r1.reviews, 'tool-1', 'member-1', 4, '수정')
    expect(r2.ok).toBe(true)
    if (!r2.ok) return
    expect(r2.reviews).toHaveLength(1)
    expect(r2.reviews[0].rating).toBe(4)
    const r3 = upsertReview(r2.reviews, 'tool-1', 'member-2', 2, '아쉬움')
    expect(r3.ok).toBe(true)
    if (!r3.ok) return
    const rating = recomputeRating(r3.reviews, 'tool-1')
    expect(rating.count).toBe(2)
    expect(rating.avg).toBe(3)
  })

  it('시드에 검증된 GitHub 항목이 20개 이상', () => {
    const list = listToolbox()
    expect(list.length).toBeGreaterThanOrEqual(20)
    expect(list.every((e) => e.canonical_url.startsWith('https://'))).toBe(true)
    expect(MUTABLE_TOOLBOX.some((e) => e.slug === 'github-mcp-server')).toBe(true)
    expect(MUTABLE_TOOLBOX.some((e) => e.slug === 'context7')).toBe(true)
  })

  it('정렬: rated는 평점 우선', () => {
    const sorted = sortEntries(listToolbox(), 'rated')
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i - 1].avg_rating).toBeGreaterThanOrEqual(sorted[i].avg_rating)
    }
  })

  it('toolish URL 감지', () => {
    expect(isToolishUrl('https://github.com/upstash/context7')).toBe(true)
    expect(isToolishUrl('https://www.youtube.com/watch?v=1')).toBe(false)
  })
})
