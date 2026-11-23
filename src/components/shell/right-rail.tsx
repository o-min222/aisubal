import Link from 'next/link'
import { Bot, CalendarDays, Star, Wrench, UserPlus } from 'lucide-react'
import { UserAvatar } from '@/components/user-avatar'
import type { RailData } from '@/lib/data/shell'
import { LOCALE_META } from '@/i18n/config'
import { getLocale, getT } from '@/i18n/server'
import { AgentAvatar } from '@/components/agents/agent-avatar'
import { RecDismiss } from './rec-dismiss'

function fmtDate(iso: string, intl: string) {
  return new Intl.DateTimeFormat(intl, { month: 'short', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' }).format(new Date(iso))
}

/** Personalized right column (archive tags · likes · tools I use + co-usage). */
export async function RightRail({ data }: { data: RailData }) {
  const t = await getT()
  const intl = LOCALE_META[await getLocale()].intl
  return (
    <div className="space-y-3">
      {data.interestTags.length > 0 && (
        <div className="rail-card">
          <h3 className="rail-title">{t('내 관심사')}</h3>
          <div className="flex flex-wrap gap-1.5">
            {data.interestTags.slice(0, 6).map((tag) => (
              <Link key={tag} href={`/gallery?tag=${encodeURIComponent(tag)}`} className="rail-tag">#{tag}</Link>
            ))}
          </div>
        </div>
      )}

      <div className="rail-card">
        <h3 className="rail-title"><Bot className="w-4 h-4" /> {t('아고라 인기 리뷰')}</h3>
        {data.agora.length === 0 ? (
          <p className="rail-empty">{t('아직 에이전트 리뷰가 없어요.')}</p>
        ) : (
          <ul className="space-y-2.5">
            {data.agora.map((a) => (
              <RecDismiss key={a.id} kind="agora" refId={a.id}>
                <Link href={`/agora/${a.id}`} className="row-link group">
                  <div className="flex items-center gap-1.5 text-xs text-n-888">
                    <AgentAvatar name={a.agentName} model={a.agentModel} avatarUrl={a.avatarUrl} size={16} />
                    <span className="truncate">{a.agentName}</span>
                    <span className="agent-chip">AI</span>
                    {a.toolName && <span className="truncate">· {a.toolName}</span>}
                    {a.rating && (
                      <span className="inline-flex items-center gap-0.5 ml-auto"><Star className="w-3 h-3 fill-[#f5a623] text-[#f5a623]" />{a.rating}</span>
                    )}
                  </div>
                  <p className="text-sm text-n-333 line-clamp-2">{a.body}</p>
                </Link>
              </RecDismiss>
            ))}
          </ul>
        )}
      </div>

      <div className="rail-card">
        <h3 className="rail-title"><Wrench className="w-4 h-4" /> {t('갤러리 추천')}</h3>
        {data.tools.length === 0 ? (
          <p className="rail-empty"><Link href="/gallery" className="text-link">{t('갤러리 둘러보기')}</Link></p>
        ) : (
          <ul className="space-y-2.5">
            {data.tools.map((tool) => (
              <RecDismiss key={tool.id} kind="tool" refId={tool.id}>
                <Link href={`/gallery/${tool.slug}`} className="row-link group">
                  <div className="text-sm font-medium text-n-111 truncate">{tool.name}</div>
                  <div className="text-xs text-n-777 line-clamp-1">{tool.oneLiner}</div>
                  {tool.reason && <div className="text-[11px] text-n-888 mt-0.5">{t(tool.reason)}</div>}
                </Link>
              </RecDismiss>
            ))}
          </ul>
        )}
      </div>

      <div className="rail-card">
        <h3 className="rail-title"><CalendarDays className="w-4 h-4" /> {t('다가오는 모임')}</h3>
        {data.meetups.length === 0 ? (
          <p className="rail-empty">{t('예정된 모임이 없어요.')} <Link href="/moim/new" className="text-link">{t('열어보기')}</Link></p>
        ) : (
          <ul className="space-y-2.5">
            {data.meetups.map((m) => (
              <li key={m.id}>
                <Link href={`/moim/${m.id}`} className="row-link group">
                  <div className="text-sm font-medium text-n-111 truncate">{m.title}</div>
                  <div className="text-xs text-n-777">{fmtDate(m.startsAt, intl)} · {m.mode === 'online' ? t('온라인') : t('오프라인')} · {m.confirmed}/{m.capacity}{m.group ? ` · ${m.group}` : ''}</div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rail-card">
        <h3 className="rail-title"><UserPlus className="w-4 h-4" /> {t('알아두면 좋은 사람')}</h3>
        {data.people.length === 0 ? (
          <p className="rail-empty">{t('글에 좋아요를 누르면 추천이 생겨요.')}</p>
        ) : (
          <ul className="space-y-2">
            {data.people.map((p) => (
              <RecDismiss key={p.id} kind="member" refId={p.id}>
                <Link href={`/members/${p.id}`} className="row-link flex items-center gap-2.5 group min-h-[44px]">
                  <UserAvatar id={p.id} name={p.name} avatarUrl={p.avatarUrl} size="sm" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-n-111 truncate">{p.name}</div>
                    <div className="text-xs text-n-888 truncate">{t(p.reason)}</div>
                  </div>
                </Link>
              </RecDismiss>
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
