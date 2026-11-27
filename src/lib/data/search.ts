import { MOCK_MEMBERS } from '@/lib/mock-data'
import { cleanQuery, snippet } from '@/lib/search-rules'
import { toolHref } from '@/lib/tool-rules'
import { sb, isMock } from './client'
import { MEMBER_PUBLIC_COLUMNS } from './member-columns'
import { listFeedTimeline } from './feed'
import { listAgoraTimeline } from './agora'
import { listTools } from './tools'
import { searchArticles } from './articles'
import { articleHref } from '@/lib/article-rules'

/**
 * Global search over what a member can already see: every query runs with the member's
 * session (RLS applies), feed search skips group posts, hidden Agora posts are dropped,
 * and the anon board is never searched.
 */
export type SearchHit = { id: string; href: string; title: string; sub: string; avatarUrl?: string | null; kind: 'people' | 'feed' | 'agora' | 'gallery' | 'articles' }
export type SearchResults = { q: string; people: SearchHit[]; feed: SearchHit[]; agora: SearchHit[]; gallery: SearchHit[]; articles: SearchHit[] }

const EMPTY = (q: string): SearchResults => ({ q, people: [], feed: [], agora: [], gallery: [], articles: [] })

async function searchPeople(q: string, limit: number): Promise<SearchHit[]> {
  type Row = { id: string; display_name: string; handle: string | null; bio: string | null; avatar_url: string | null }
  let rows: Row[]
  if (isMock()) {
    const n = q.toLowerCase()
    rows = MOCK_MEMBERS.filter((m) => m.display_name.toLowerCase().includes(n) || (m.handle ?? '').toLowerCase().includes(n)).slice(0, limit) as Row[]
  } else {
    const supabase = await sb()
    const { data, error } = await supabase
      .from('members')
      .select(MEMBER_PUBLIC_COLUMNS)
      .not('signup_completed_at', 'is', null)
      .eq('is_banned', false)
      .or(`display_name.ilike.%${q}%,handle.ilike.%${q}%`)
      .limit(limit)
    if (error) throw error
    rows = (data || []) as unknown as Row[]
  }
  return rows.map((m) => ({
    id: m.id,
    kind: 'people',
    href: m.handle ? `/u/${m.handle}` : `/members/${m.id}`,
    title: m.display_name,
    sub: [m.handle ? `@${m.handle}` : null, m.bio].filter(Boolean).join(' · ').slice(0, 90),
    avatarUrl: m.avatar_url,
  }))
}

export async function search(viewerId: string, raw: unknown, limit = 5): Promise<SearchResults> {
  const q = cleanQuery(raw)
  if (!q) return EMPTY('')
  const [people, feed, agora, gallery, articles] = await Promise.all([
    searchPeople(q, limit).catch(() => []),
    listFeedTimeline(viewerId, { q, limit }).catch(() => []),
    listAgoraTimeline(viewerId, { q, limit: limit * 2 }).catch(() => []),
    listTools(viewerId, { q }).catch(() => []),
    searchArticles(q, limit).catch(() => []),
  ])
  return {
    q,
    people,
    feed: feed.map((p) => ({ id: p.id, kind: 'feed', href: `/posts/${p.id}`, title: p.title || snippet(p.body, q, 60), sub: `${p.author.name} · ${snippet(p.body, q)}` })),
    agora: agora
      .filter((p) => !p.isHidden)
      .slice(0, limit)
      .map((p) => ({ id: p.id, kind: 'agora', href: `/agora/${p.id}`, title: snippet(p.body, q, 60), sub: p.author.name })),
    gallery: gallery.slice(0, limit).map((t) => ({ id: t.id, kind: 'gallery', href: toolHref(t), title: t.name, sub: t.one_liner })),
    articles: articles.slice(0, limit).map((a) => ({
      id: a.id,
      kind: 'articles' as const,
      href: articleHref(a.slug),
      title: a.title,
      sub: `${a.author.name}${a.subtitle ? ' · ' + snippet(a.subtitle, q) : ''}`.slice(0, 90),
    })),
  }
}
