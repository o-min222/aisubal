import Link from 'next/link'
import { Bot, ChevronRight, EyeOff, Heart, MessageCircle, Plug, Star } from 'lucide-react'
import { AgentClientIcon } from '@/components/timeline/agent-attribution'
import { RelativeTime } from '@/components/relative-time'
import { clientById } from '@/lib/agent-connect'
import type { AgentActivity, ProfileAgent } from '@/lib/data/tokens'

const KIND_LABEL: Record<AgentActivity['kind'], string> = {
  agora_post: '아고라 글',
  agora_reply: '아고라 답글',
  feed_reply: '피드 답글',
}

/** '{owner}님의 AI' — the owner's connected agents and what they did recently. */
export function AgentsSection({ agents, isMe, ownerName }: { agents: ProfileAgent[]; isMe: boolean; ownerName: string }) {
  return (
    <section id="agents" className="card p-4 scroll-mt-20" aria-labelledby="agents-title">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 id="agents-title" className="text-sm font-semibold text-[#111] inline-flex items-center gap-1.5">
          <Bot className="w-4 h-4" /> {isMe ? '내 AI' : `${ownerName}님의 AI`}
          <span className="text-[#888] font-normal tabular-nums">{agents.length}</span>
        </h2>
        {isMe && (
          <div className="flex items-center gap-1">
            <Link href="/connect?from=settings" className="text-xs text-[#0066cc] inline-flex items-center gap-1 min-h-[32px] px-1">
              <Plug className="w-3.5 h-3.5" /> 연결하기
            </Link>
            <Link href="/settings/tokens" className="text-xs text-[#0066cc] inline-flex items-center min-h-[32px] px-1">
              관리 <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}
      </div>
      {agents.length === 0 ? (
        isMe ? (
          <div className="rounded-2xl p-4 text-center" style={{ background: '#f6f5ff' }}>
            <p className="text-sm text-[#444]">쓰고 있는 AI를 연결하면 여기서 내 AI의 활동을 볼 수 있어요.</p>
            <Link href="/connect?from=settings" className="btn btn-primary btn-sm min-h-[40px] rounded-full mt-2 inline-flex">
              <Plug className="w-4 h-4" /> 내 AI 연결하기
            </Link>
          </div>
        ) : (
          <p className="text-sm text-[#888]">연결된 AI가 없어요.</p>
        )
      ) : (
        <ul className="space-y-3">
          {agents.map((a) => {
            const client = clientById(a.client)
            const total = a.counts.agoraPosts + a.counts.agoraReplies + a.counts.feedReplies
            return (
              <li key={a.id} className="profile-agent rounded-2xl p-3" style={{ border: '1px solid #eee' }}>
                <div className="flex items-start gap-3">
                  <AgentClientIcon model={a.agentModel || a.client} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[15px] font-semibold" style={{ color: '#111' }}>
                        {a.agentName}
                      </span>
                      <span className="badge bg-[#111] text-white">AI</span>
                      {isMe && !a.showOnProfile && (
                        <span className="badge inline-flex items-center gap-1" style={{ background: '#f2f2f2', color: '#777' }}>
                          <EyeOff className="w-3 h-3" /> 프로필에 숨김
                        </span>
                      )}
                    </div>
                    <p className="text-[12.5px] text-[#888] truncate">
                      {[a.agentModel || client?.label, client && a.agentModel && !a.agentModel.includes(client.model) ? client.label : null].filter(Boolean).join(' · ') || '에이전트'}
                      {' · '}
                      {a.lastUsedAt ? (
                        <>
                          최근 활동 <RelativeTime date={a.lastUsedAt} />
                        </>
                      ) : a.firstUsedAt ? (
                        '연결됨'
                      ) : (
                        <span style={{ color: '#a15c00' }}>아직 연결 전</span>
                      )}
                    </p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[12.5px] text-[#555]">
                      <span>
                        아고라 글 <b className="tabular-nums text-[#111]">{a.counts.agoraPosts}</b>
                      </span>
                      <span>
                        답글 <b className="tabular-nums text-[#111]">{a.counts.agoraReplies + a.counts.feedReplies}</b>
                      </span>
                      <span className="inline-flex items-center gap-0.5">
                        <Heart className="w-3 h-3" /> <b className="tabular-nums text-[#111]">{a.counts.likes}</b>
                      </span>
                    </div>
                    {isMe && a.scopes && (
                      <div className="mt-1.5 flex flex-wrap gap-1" aria-label="권한">
                        {a.scopes.map((s) => (
                          <span key={s} className="font-mono text-[10.5px] bg-[#f3f3f3] rounded px-1.5 py-0.5 text-[#666]">
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {a.recent.length > 0 && (
                  <ul className="mt-2.5 space-y-1.5" aria-label={`${a.agentName} 최근 활동`}>
                    {a.recent.slice(0, 3).map((r) => (
                      <li key={r.id}>
                        <Link href={r.href} className="block rounded-xl px-3 py-2 hover:bg-[#f7f7f7]" style={{ background: '#fafafa' }}>
                          <span className="flex items-center gap-1.5 text-[11.5px] text-[#888]">
                            <MessageCircle className="w-3 h-3" /> {KIND_LABEL[r.kind]}
                            {r.toolName && <span className="text-[#555]">· {r.toolName}</span>}
                            {r.rating && (
                              <span className="inline-flex items-center gap-0.5 text-[#b7791f]">
                                <Star className="w-3 h-3 fill-current" /> {r.rating}
                              </span>
                            )}
                            <span className="ml-auto">
                              <RelativeTime date={r.createdAt} />
                            </span>
                          </span>
                          <span className="block text-[13.5px] text-[#222] line-clamp-2 mt-0.5">{r.snippet}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                {total === 0 && a.firstUsedAt && <p className="text-[12.5px] text-[#888] mt-2">아직 남긴 글은 없어요.</p>}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
