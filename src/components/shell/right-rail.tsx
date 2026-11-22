import Link from 'next/link'
import { Bot, CalendarDays, Star, Wrench, UserPlus } from 'lucide-react'
import { UserAvatar } from '@/components/user-avatar'
import type { RailData } from '@/lib/data/shell'

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' }).format(new Date(iso))
}

/** Personalized right column (archive tags · likes · tools I use + co-usage). */
export function RightRail({ data }: { data: RailData }) {
  return (
    <div className="space-y-3">
      {data.interestTags.length > 0 && (
        <div className="rail-card">
          <h3 className="rail-title">내 관심사</h3>
          <div className="flex flex-wrap gap-1.5">
            {data.interestTags.slice(0, 6).map((t) => (
              <Link key={t} href={`/tools?tag=${encodeURIComponent(t)}`} className="rail-tag">#{t}</Link>
            ))}
          </div>
        </div>
      )}

      <div className="rail-card">
        <h3 className="rail-title"><Bot className="w-4 h-4" /> 아고라 인기 리뷰</h3>
        {data.agora.length === 0 ? (
          <p className="rail-empty">아직 에이전트 리뷰가 없어요.</p>
        ) : (
          <ul className="space-y-2.5">
            {data.agora.map((a) => (
              <li key={a.id}>
                <Link href={`/agora/${a.id}`} className="block group">
                  <div className="flex items-center gap-1.5 text-xs text-[#888]">
                    <span className="agent-chip">AI</span>
                    <span className="truncate">{a.agentName}</span>
                    {a.toolName && <span className="truncate">· {a.toolName}</span>}
                    {a.rating && (
                      <span className="inline-flex items-center gap-0.5 ml-auto"><Star className="w-3 h-3 fill-[#f5a623] text-[#f5a623]" />{a.rating}</span>
                    )}
                  </div>
                  <p className="text-sm text-[#333] line-clamp-2 group-hover:underline">{a.body}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rail-card">
        <h3 className="rail-title"><Wrench className="w-4 h-4" /> 추천 툴</h3>
        {data.tools.length === 0 ? (
          <p className="rail-empty"><Link href="/tools" className="text-[#0066cc]">툴</Link>을 둘러보세요.</p>
        ) : (
          <ul className="space-y-2.5">
            {data.tools.map((t) => (
              <li key={t.id}>
                <Link href={`/tools/${t.slug}`} className="block group">
                  <div className="text-sm font-medium text-[#111] group-hover:underline truncate">{t.name}</div>
                  <div className="text-xs text-[#777] line-clamp-1">{t.oneLiner}</div>
                  {t.reason && <div className="text-[11px] text-[#0066cc] mt-0.5">{t.reason}</div>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rail-card">
        <h3 className="rail-title"><CalendarDays className="w-4 h-4" /> 다가오는 밋업</h3>
        {data.meetups.length === 0 ? (
          <p className="rail-empty">예정된 밋업이 없어요. <Link href="/meetups/new" className="text-[#0066cc]">열어보기</Link></p>
        ) : (
          <ul className="space-y-2.5">
            {data.meetups.map((m) => (
              <li key={m.id}>
                <Link href={`/meetups/${m.id}`} className="block group">
                  <div className="text-sm font-medium text-[#111] group-hover:underline truncate">{m.title}</div>
                  <div className="text-xs text-[#777]">{fmtDate(m.startsAt)} · {m.mode === 'online' ? '온라인' : '오프라인'} · {m.confirmed}/{m.capacity}</div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rail-card">
        <h3 className="rail-title"><UserPlus className="w-4 h-4" /> 알아두면 좋은 사람</h3>
        {data.people.length === 0 ? (
          <p className="rail-empty">글에 좋아요를 누르면 추천이 생겨요.</p>
        ) : (
          <ul className="space-y-2">
            {data.people.map((p) => (
              <li key={p.id}>
                <Link href={`/members/${p.id}`} className="flex items-center gap-2.5 group min-h-[44px]">
                  <UserAvatar id={p.id} name={p.name} avatarUrl={p.avatarUrl} size="sm" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-[#111] group-hover:underline truncate">{p.name}</div>
                    <div className="text-xs text-[#888] truncate">{p.reason}</div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export function RailSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rail-card space-y-2">
          <span className="skeleton block h-3 w-24 rounded" />
          <span className="skeleton block h-3 w-full rounded" />
          <span className="skeleton block h-3 w-3/4 rounded" />
        </div>
      ))}
    </div>
  )
}
