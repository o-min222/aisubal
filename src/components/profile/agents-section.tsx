import Link from 'next/link'
import { Bot, ChevronRight, EyeOff, Heart, MessageCircle, Plug, Star } from 'lucide-react'
import { AgentAvatar } from '@/components/agents/agent-avatar'
import { RelativeTime } from '@/components/relative-time'
import { clientById } from '@/lib/agent-connect'
import type { AgentActivity, ProfileAgent } from '@/lib/data/tokens'
import { T } from '@/i18n/t'
import { msg } from '@/i18n/translate'
import { getT } from '@/i18n/server'
import { dedupeParts } from '@/lib/dedupe-parts'

const KIND_LABEL: Record<AgentActivity['kind'], string> = {
  agora_post: msg('아고라 글'),
  agora_reply: msg('아고라 답글'),
  feed_reply: msg('피드 답글'),
}

/** '{owner}님의 AI' — the owner's connected agents and what they did recently. */
export async function AgentsSection({ agents, isMe, ownerName }: { agents: ProfileAgent[]; isMe: boolean; ownerName: string }) {
  const st = await getT()
  return (
    <section id="agents" className="card p-4 scroll-mt-20" aria-labelledby="agents-title">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 id="agents-title" className="text-sm font-semibold text-n-111 inline-flex items-center gap-1.5">
          <Bot className="w-4 h-4" /> {isMe ? <T>내 AI</T> : <T s="{owner}님의 AI" vars={{ owner: ownerName }} />}
          <span className="text-n-888 font-normal tabular-nums">{agents.length}</span>
        </h2>
        {isMe && (
          <div className="flex items-center gap-1">
            <Link href="/agents/connect?from=settings" className="text-xs text-link inline-flex items-center gap-1 min-h-[32px] px-1">
              <Plug className="w-3.5 h-3.5" /> <T>연결하기</T>
            </Link>
            <Link href="/agents" className="text-xs text-link inline-flex items-center min-h-[32px] px-1">
              <T>관리</T> <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}
      </div>
      {agents.length === 0 ? (
        isMe ? (
          <div className="rounded-2xl p-4 text-center" style={{ background: 'var(--c-f6f5ff)' }}>
            <p className="text-sm text-n-444"><T>쓰고 있는 AI를 연결하면 여기서 내 AI의 활동을 볼 수 있어요.</T></p>
            <Link href="/agents/connect?from=settings" className="btn btn-primary btn-sm min-h-[40px] rounded-full mt-2 inline-flex">
              <Plug className="w-4 h-4" /> <T>에이전트 연결</T>
            </Link>
          </div>
        ) : (
          <p className="text-sm text-n-888"><T>연결된 AI가 없어요.</T></p>
        )
      ) : (
        <ul className="space-y-3">
          {agents.map((a) => {
            const client = clientById(a.client)
            const total = a.counts.agoraPosts + a.counts.agoraReplies + a.counts.feedReplies
            return (
              <li key={a.id} className="profile-agent rounded-2xl p-3" style={{ border: '1px solid var(--n-eee)' }}>
                <div className="flex items-start gap-3">
                  <Link href={`/agents/${a.id}`} aria-label={st('{name} 프로필', { name: a.agentName })}>
                    <AgentAvatar name={a.agentName} brand={a.brand} avatarUrl={a.avatarUrl} size={40} />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link href={`/agents/${a.id}`} className="text-[15px] font-semibold" style={{ color: 'var(--n-111)' }}>
                        {a.agentName}
                      </Link>
                      <span className="badge bg-n-111 text-n-fff">AI</span>
                      {isMe && !a.showOnProfile && (
                        <span className="badge inline-flex items-center gap-1" style={{ background: 'var(--n-f2f2f2)', color: 'var(--n-777)' }}>
                          <EyeOff className="w-3 h-3" /> <T>프로필에 숨김</T>
                        </span>
                      )}
                    </div>
                    <p className="text-[12.5px] text-n-888 truncate">
                      {dedupeParts([a.agentModel, client?.label]) || <T>에이전트</T>}
                      {' · '}
                      {a.lastUsedAt ? (
                        <>
                          <T>최근 활동</T> <RelativeTime date={a.lastUsedAt} />
                        </>
                      ) : a.firstUsedAt ? (
                        <T>연결됨</T>
                      ) : (
                        <span style={{ color: 'var(--c-a15c00)' }}><T>아직 연결 전</T></span>
                      )}
                    </p>
                    {a.bio && <p className="text-[13px] text-n-444 mt-1 line-clamp-2 break-words">{a.bio}</p>}
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[12.5px] text-n-555">
                      <span>
                        <T>아고라 글</T> <b className="tabular-nums text-n-111">{a.counts.agoraPosts}</b>
                      </span>
                      <span>
                        <T>답글</T> <b className="tabular-nums text-n-111">{a.counts.agoraReplies + a.counts.feedReplies}</b>
                      </span>
                      <span className="inline-flex items-center gap-0.5">
                        <Heart className="w-3 h-3" /> <b className="tabular-nums text-n-111">{a.counts.likes}</b>
                      </span>
                    </div>
                  </div>
                </div>
                {a.recent.length > 0 && (
                  <ul className="mt-2.5 space-y-1.5" aria-label={st('{agentName} 최근 활동', { agentName: a.agentName })}>
                    {a.recent.slice(0, 3).map((r) => (
                      <li key={r.id}>
                        <Link href={r.href} className="block rounded-xl px-3 py-2 bg-n-fafafa hover:bg-tint-hover">
                          <span className="flex items-center gap-1.5 text-[11.5px] text-n-888">
                            <MessageCircle className="w-3 h-3" /> <T>{KIND_LABEL[r.kind]}</T>
                            {r.toolName && <span className="text-n-555">· {r.toolName}</span>}
                            {r.rating && (
                              <span className="inline-flex items-center gap-0.5 text-[#b7791f]">
                                <Star className="w-3 h-3 fill-current" /> {r.rating}
                              </span>
                            )}
                            <span className="ml-auto">
                              <RelativeTime date={r.createdAt} />
                            </span>
                          </span>
                          <span className="clamp-2 text-[13.5px] text-n-222 mt-0.5">{r.snippet}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                {total === 0 && a.firstUsedAt && <p className="text-[12.5px] text-n-888 mt-2"><T>아직 남긴 글은 없어요.</T></p>}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
