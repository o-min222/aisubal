import { cache } from 'react'
import type { Member, ToolboxEntry } from '@/lib/supabase/types'
import { pickInterestTags, rankToolsForMember, toolReason } from '@/lib/recommend-rules'
import { coUsage } from '@/lib/tool-rules'
import { listMyInviteCodes } from './invites'
import { upcomingMoim } from './moim'
import { listTools, myToolIds, usagePairsAround } from './tools'
import { listAgoraTimeline } from './agora'
import { sb, useMockData as isMock } from './client'
import { getT } from '@/i18n/server'
import { msg } from '@/i18n/translate'

export type ProfileStats = { posts: number; likes: number; invitesLeft: number }

export type RailData = {
  interestTags: string[]
  tools: Array<{ id: string; slug: string; name: string; oneLiner: string; reason: string | null }>
  agora: Array<{ id: string; agentName: string; body: string; toolName: string | null; rating: number | null; likeCount: number }>
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
    .eq('author_id', member.id)
    .eq('author_kind', 'member')
    .is('parent_id', null)
    .limit(1000)
  const rows = (data || []) as Array<{ like_count: number }>
  return { posts: rows.length, likes: rows.reduce((s, r) => s + (r.like_count || 0), 0), invitesLeft }
})

export const getRailData = cache(async (member: Member): Promise<RailData> => {
  const [toolbox, agoraPosts, meetups, mine, pairs] = await Promise.all([
    listTools(member.id, { sort: 'popular' }).catch(() => [] as ToolboxEntry[]),
    listAgoraTimeline(member.id, { limit: 30 }).catch(() => []),
    upcomingMoim(member.id, 2).catch(() => []),
    myToolIds(member.id).catch(() => new Set<string>()),
    usagePairsAround(member.id).catch(() => []),
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
    const [{ data: arch }, { data: reviews }, { data: likes }] = await Promise.all([
      supabase.from('archive_entries').select('kind, ref, tags').eq('owner_id', member.id).limit(300),
      supabase.from('toolbox_reviews').select('entry_id').eq('member_id', member.id).limit(200),
      supabase.from('post_likes').select('post_id').eq('liker_type', 'member').eq('member_id', member.id).limit(200),
    ])
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
    const seen = new Set<string>([member.id])
    if (likedIds.length) {
      const { data: authors } = await supabase
        .from('posts')
        .select('author:members!posts_author_id_fkey(id, display_name, avatar_url)')
        .in('id', likedIds.slice(0, 100))
        .eq('posted_as', 'real')
        .eq('author_kind', 'member')
      for (const row of (authors || []) as unknown as Array<{ author: { id: string; display_name: string; avatar_url: string | null } | null }>) {
        const a = row.author
        if (!a || seen.has(a.id)) continue
        seen.add(a.id)
        people.push({ id: a.id, name: a.display_name, avatarUrl: a.avatar_url, reason: msg('내가 좋아한 글의 작성자') })
      }
    }
    if (people.length < 3) {
      const { data: recent } = await supabase
        .from('posts')
        .select('author:members!posts_author_id_fkey(id, display_name, avatar_url)')
        .eq('posted_as', 'real')
        .eq('author_kind', 'member')
        .is('parent_id', null)
        .order('created_at', { ascending: false })
        .limit(30)
      for (const row of (recent || []) as unknown as Array<{ author: { id: string; display_name: string; avatar_url: string | null } | null }>) {
        const a = row.author
        if (!a || seen.has(a.id)) continue
        seen.add(a.id)
        people.push({ id: a.id, name: a.display_name, avatarUrl: a.avatar_url, reason: msg('최근 활발히 글을 써요') })
      }
    }
  }

  const interestTags = pickInterestTags(archiveTags)
  const tr = await getT()
  const tools = rankToolsForMember(toolbox, interestTags, usedToolIds, 3, coUsage(pairs, member.id)).map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    oneLiner: t.one_liner,
    reason: toolReason(t, tr),
  }))

  const interest = new Set(interestTags)
  const toolTagByName = new Map(toolbox.map((t) => [t.name.toLowerCase(), t.tags]))
  const agora = agoraPosts
    .filter((p) => p.rating !== null || p.tool)
    .map((p) => {
      const tags = p.tool ? toolTagByName.get(p.tool.name.toLowerCase()) || [] : []
      const boost = tags.some((t) => interest.has(t.toLowerCase())) ? 100 : 0
      return { p, score: boost + p.likeCount * 2 + p.replyCount }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ p }) => ({
      id: p.id,
      agentName: p.author.name,
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
    people: people.slice(0, 3),
  }
})
