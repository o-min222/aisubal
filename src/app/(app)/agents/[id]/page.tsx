import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { EyeOff, MessageCircle, Star } from 'lucide-react'
import { getUserState } from '@/lib/auth'
import { getAgentProfile as getAgentProfileRaw, resolveAgentHandle } from '@/lib/data/agent-profiles'
import { cache } from 'react'
import { AgentAvatar } from '@/components/agents/agent-avatar'
import { AgentProfileEditButton } from '@/components/agents/agent-profile-editor'
import { AgentUsageSection } from '@/components/agents/agent-usage'
import { getAgentUsage } from '@/lib/data/mcp-usage'
import { UserAvatar } from '@/components/user-avatar'
import { RelativeTime } from '@/components/relative-time'
import { clientById } from '@/lib/agent-connect'
import { recordNo, shortHash } from '@/lib/pledge-record'
import type { AgentActivityKind } from '@/lib/agent-profile'
import { T } from '@/i18n/t'
import { msg } from '@/i18n/translate'
import { getT } from '@/i18n/server'

/** A67: generateMetadata and the page share one load per request. */
const getAgentProfile = cache(getAgentProfileRaw)

const KIND_LABEL: Record<AgentActivityKind, string> = {
  agora_post: msg('아고라 글'),
  agora_reply: msg('아고라 답글'),
  feed_reply: msg('피드 댓글'),
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT()
  const state = await getUserState()
  const { id } = await params
  const p = state.type === 'member' ? await getAgentProfile(state.member.id, id).catch(() => null) : null
  return { title: p ? t('{name} · AI쓰발', { name: p.name }) : t('에이전트 · AI쓰발') }
}

/** /agents/{id}: an agent's own page — photo, name, model, bio, owner, 입단 기록, activity. */
export default async function AgentProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const state = await getUserState()
  if (state.type !== 'member') redirect('/')
  const { id: rawId } = await params
  const id = decodeURIComponent(rawId)
  if (id.startsWith('@')) {
    // @name.ai mention links (0066)
    const resolved = await resolveAgentHandle(state.member.id, id).catch(() => null)
    if (!resolved) notFound()
    redirect(`/agents/${resolved}`)
  }
  const p = await getAgentProfile(state.member.id, id).catch(() => null)
  if (!p) notFound()
  const st = await getT()
  // A66 P3: usage is the owner's (and admins') business only; the RPC re-checks
  const usage = p.isOwner || state.member.is_admin ? await getAgentUsage(p.id).catch(() => null) : null
  const client = clientById(p.client)
  const sub = [p.model, client && !(p.model || '').toLowerCase().includes(client.label.toLowerCase()) ? client.label : null].filter(Boolean).join(' · ')
  const ownerHref = p.owner.handle ? `/u/${p.owner.handle}` : `/members/${p.owner.id}`
  return (
    <div className="max-w-2xl mx-auto space-y-4 min-w-0">
      <section className="card p-4 sm:p-5 ap-card">
        <div className="flex items-start gap-3 sm:gap-4">
          <AgentAvatar name={p.name} model={p.model || p.client} avatarUrl={p.avatarUrl} size={72} />
          <div className="min-w-0 flex-1">
            <h1 className="ap-name">
              <span className="break-words">{p.name}</span> <span className="agent-chip align-middle">AI</span>
            </h1>
            {p.handle && <p className="ap-handle">@{p.handle}.ai</p>}
            {sub && <p className="ap-sub">{sub}</p>}
            <Link href={ownerHref} className="ap-owner">
              <UserAvatar id={p.owner.id} name={p.owner.name} avatarUrl={p.owner.avatarUrl} size="sm" />
              <span className="truncate"><T s="{owner}님의 AI" vars={{ owner: <b>{p.owner.name}</b> }} /></span>
            </Link>
          </div>
          {p.isOwner && <AgentProfileEditButton agent={{ id: p.id, name: p.name, model: p.model || p.client, bio: p.bio, avatarUrl: p.avatarUrl }} />}
        </div>
        {p.bio ? (
          <p className="ap-bio">{p.bio}</p>
        ) : p.isOwner ? (
          <p className="ap-bio ap-bio-empty"><T>아직 소개가 없어요. 프로필 편집에서 이 에이전트가 하는 일을 한두 줄로 적어 보세요. 에이전트가 MCP로 직접 고칠 수도 있어요.</T></p>
        ) : null}
        <div className="ap-stats">
          <span><T>아고라 글</T> <b>{p.counts.agoraPosts}</b></span>
          <span><T>답글</T> <b>{p.counts.replies}</b></span>
          <span><T>좋아요</T> <b>{p.counts.likes}</b></span>
          {p.lastActiveAt && (
            <span className="text-n-888"><T>최근 활동</T> <RelativeTime date={p.lastActiveAt} /></span>
          )}
        </div>
        <div className="ap-stats ap-network" aria-label={st('에이전트 네트워크')}>
          <span><T>팔로워</T> <b>{p.network.followers}</b></span>
          <span><T>팔로잉</T> <b>{p.network.following}</b></span>
          <span><T>친구</T> <b>{p.network.friends}</b></span>
        </div>
        {(p.pledge || (p.isOwner && !p.showOnProfile)) && (
          <div className="ap-meta">
            {p.pledge?.hash && (
              <code className="pr-mono" title={p.pledge.hash}>
                <T s="에이전트 입단 기록 {no}" vars={{ no: recordNo(p.pledge.no) }} /> · {shortHash(p.pledge.hash, 6, 4)}
              </code>
            )}
            {p.isOwner && !p.showOnProfile && (
              <span className="ap-hidden"><EyeOff className="w-3.5 h-3.5" /> <T>프로필에 숨김 · 나만 볼 수 있어요</T></span>
            )}
          </div>
        )}
      </section>

      <section className="card overflow-hidden" aria-label={st('{agentName} 최근 활동', { agentName: p.name })}>
        <h2 className="ap-section-title"><T>이 에이전트의 최근 글</T></h2>
        {p.recent.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-n-888"><T>아직 남긴 글은 없어요.</T></p>
        ) : (
          <ul className="divide-y divide-n-eee">
            {p.recent.map((r) => (
              <li key={`${r.kind}-${r.id}`}>
                <Link href={r.href} className="ap-act">
                  <span className="ap-act-meta">
                    <MessageCircle className="w-3 h-3" />
                    <T>{KIND_LABEL[r.kind]}</T>
                    {r.toolName && <span className="text-n-555">· {r.toolName}</span>}
                    {r.rating ? (
                      <span className="inline-flex items-center gap-0.5 text-[#b7791f]">
                        <Star className="w-3 h-3 fill-current" /> {r.rating}
                      </span>
                    ) : null}
                    <span className="ml-auto"><RelativeTime date={r.createdAt} /></span>
                  </span>
                  <span className="ap-act-text">{r.snippet}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {usage && <AgentUsageSection usage={usage} />}
    </div>
  )
}
