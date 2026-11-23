import { cache } from 'react'
import { ownPostsFilter } from './own-posts'
import type { Member, ToolboxEntry } from '@/lib/supabase/types'
import { pickInterestTags, rankToolsForMember, toolReason } from '@/lib/recommend-rules'
import { coUsage } from '@/lib/tool-rules'
import { listMyInviteCodes } from './invites'
import { upcomingMoim } from './moim'
import { listTools, myToolIds, usagePairsAround } from './tools'
import { listAgoraTimeline } from './agora'
import { sb, isMock } from './client'
import { getT } from '@/i18n/server'
import { msg } from '@/i18n/translate'
import { withAgentCards } from './agent-profiles'
import { listDismissed } from './rec-dismissals'

export type ProfileStats = { posts: number; likes: number; invitesLeft: number }

export type RailData = {
  interestTags: string[]
  tools: Array<{ id: string; slug: string; name: string; oneLiner: string; reason: string | null }>
  agora: Array<{ id: string; agentName: string; agentModel: string | null; avatarUrl: string | null; body: string; toolName: string | null; rating: number | null; likeCount: number }>
  meetups: Array<{ id: string; title: string; startsAt: string; mode: string; confirmed: number; capacity: number; group: string | null }>
  people: Array<{ id: string; name: string; avatarUrl: string | null; reason: string }>
}

export const getProfileStats = cache(async (member: Member): Promise<ProfileStats> => {
  const invites = await listMyInviteCodes(member.id, Boolean(member.signup_completed_at)).catch(() => null)
  const invitesLeft = invites ? invites.codes.filter((c) => !c.isUsed).length : 0
  if (isMock()) return { posts: 4, likes: 37, invitesLeft }
  const supabase = await sb()
  const { data } = await supabase
    .from('posts')
    .select('like_count')
    .or(ownPostsFilter(member.id, member.nickname_id))
    .eq('author_kind', 'member')
    .is('parent_id', null)
    .limit(1000)
  const rows = (data || []) as Array<{ like_count: number }>
  return { posts: rows.length, likes: rows.reduce((s, r) => s + (r.like_count || 0), 0), invitesLeft }
})

export const getRailData = cache(async (member: Member): Promise<RailData> => {
  const personal = isMock()
    ? null
    : sb().then((supabase) =>
        Promise.all([
          supabase.from('archive_entries').select('kind, ref, tags').eq('owner_id', member.id).limit(300),
          supabase.from('toolbox_reviews').select('entry_id').eq('member_id', member.id).limit(200),
          supabase.from('post_likes').select('post_id').eq('liker_type', 'member').eq('member_id', member.id).limit(200),
        ])
      )
  const [toolbox, agoraPosts, meetups, mine, pairs, dismissed] = await Promise.all([
    listTools(member.id, { sort: 'popular' }).catch(() => [] as ToolboxEntry[]),
    listAgoraTimeline(member.id, { limit: 30 }).catch(() => []),
    upcomingMoim(member.id, 2).catch(() => []),
    myToolIds(member.id).catch(() => new Set<string>()),
    usagePairsAround(member.id).catch(() => []),
    listDismissed(member.id).catch(() => null),
  ])

  let archiveTags: string[][] = []
  let usedToolIds = new Set<string>(mine)
  let people: RailData['people'] = []

  if (isMock()) {
    archiveTags = [['mcp', 'agent'], ['cursor', 'mcp'], ['prompt']]
    people = [
      { id: 'member-2', name: '프롬프트수집가', avatarUrl: null, reason: msg('내가 좋아한 글의 작성자') },
      { id: 'member-3', name: 'MCP장인', avatarUrl: null, reason: msg('최근 활발히 글을 써요') },
    ]
  } else {
    const supabase = await sb()
    const [{ data: arch }, { data: reviews }, { data: likes }] = await personal!
    const archRows = (arch || []) as Array<{ kind: string; ref: string; tags: string[] }>
    archiveTags = archRows.map((r) => r.tags)
    usedToolIds = new Set([
      ...mine,
      ...archRows.filter((r) => r.kind === 'tool').map((r) => r.ref),
      ...((reviews || []) as Array<{ entry_id: string }>).map((r) => r.entry_id),
    ])
    // tools I used contribute their tags to my interests
    archiveTags.push(...toolbox.filter((t) => usedToolIds.has(t.id)).map((t) => t.tags))

    const likedIds = ((likes || []) as Array<{ post_id: string }>).map((l) => l.post_id)
    const seen = new Set<string>([member.id, ...(dismissed?.member ?? [])])
    // both sources at once; 'liked' authors still come first, 'recent' only fills up to 3
    const [{ data: authors }, { data: recent }] = await Promise.all([
      likedIds.length
        ? supabase
            .from('posts')
            .select('author:members!posts_public_author_id_fkey(id, display_name, avatar_url)')
            .in('id', likedIds.slice(0, 100))
            .eq('posted_as', 'real')
            .eq('author_kind', 'member')
        : Promise.resolve({ data: [] }),
      supabase
        .from('posts')
        .select('author:members!posts_public_author_id_fkey(id, display_name, avatar_url)')
        .eq('posted_as', 'real')
        .eq('author_kind', 'member')
        .is('parent_id', null)
        .order('created_at', { ascending: false })
        .limit(30),
    ])
    type AuthorRow = { author: { id: string; display_name: string; avatar_url: string | null } | null }
    for (const row of (authors || []) as unknown as AuthorRow[]) {
      const a = row.author
      if (!a || seen.has(a.id)) continue
      seen.add(a.id)
      people.push({ id: a.id, name: a.display_name, avatarUrl: a.avatar_url, reason: msg('내가 좋아한 글의 작성자') })
    }
    if (people.length < 3) {
      for (const row of (recent || []) as unknown as AuthorRow[]) {
        const a = row.author
        if (!a || seen.has(a.id)) continue
        seen.add(a.id)
        people.push({ id: a.id, name: a.display_name, avatarUrl: a.avatar_url, reason: msg('최근 활발히 글을 써요') })
      }
    }
  }

  const interestTags = pickInterestTags(archiveTags)
  const tr = await getT()
  // 관심 없음: dismissed tools rank like tools I already use (skipped)
  const toolExclude = new Set([...usedToolIds, ...(dismissed?.tool ?? [])])
  const tools = rankToolsForMember(toolbox, interestTags, toolExclude, 3, coUsage(pairs, member.id)).map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    oneLiner: t.one_liner,
    reason: toolReason(t, tr),
  }))

  const interest = new Set(interestTags)
  const toolTagByName = new Map(toolbox.map((t) => [t.name.toLowerCase(), t.tags]))
  const agoraTop = agoraPosts
    .filter((p) => (p.rating !== null || p.tool) && !dismissed?.agora.has(p.id))
    .map((p) => {
      const tags = p.tool ? toolTagByName.get(p.tool.name.toLowerCase()) || [] : []
      const boost = tags.some((t) => interest.has(t.toLowerCase())) ? 100 : 0
      return { p, score: boost + p.likeCount * 2 + p.replyCount }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
  // same photo as /agents/{id}
  const agora = (await withAgentCards(agoraTop.map(({ p }) => p)).catch(() => agoraTop.map(({ p }) => p)))
    .map((p) => ({
      id: p.id,
      agentName: p.author.name,
      agentModel: p.author.subtitle ?? null,
      avatarUrl: p.author.avatarUrl ?? null,
      body: p.body.slice(0, 90),
      toolName: p.tool?.name ?? null,
      rating: p.rating,
      likeCount: p.likeCount,
    }))

  return {
    interestTags,
    tools,
    agora,
    meetups: meetups.map((m) => ({
      id: m.id,
      title: m.title,
      startsAt: m.startsAt,
      mode: m.mode,
      confirmed: m.confirmed,
      capacity: m.capacity,
      group: m.group?.name ?? null,
    })),
    people: people.filter((p) => !dismissed?.member.has(p.id)).slice(0, 3),
  }
})
