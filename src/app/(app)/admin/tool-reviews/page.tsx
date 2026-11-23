import Link from 'next/link'
import { Merge } from 'lucide-react'
import { getUserState } from '@/lib/auth'
import { listMerges, listSubmissions } from '@/lib/data/tool-submissions'
import { STATUS_LABEL, SUBMISSION_STATUSES, parseStatusTab } from '@/lib/tool-review'
import { LinkTabs } from '@/components/link-tabs'
import { InfiniteList } from '@/components/infinite/infinite-list'
import { SubPageHeader } from '@/components/shell/sub-nav-layout'
import { RelativeTime } from '@/components/relative-time'
import { SubmissionRow } from '@/components/tools/submissions/submission-row'
import { T } from '@/i18n/t'
import { msg } from '@/i18n/translate'
import { getT } from '@/i18n/server'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('갤러리 기록 · 관리 · AI쓰발') }
}
const PAGE = 20

/**
 * Admin log of gallery uploads. Uploads publish immediately (0088); an hourly
 * pg_cron job merges duplicates into the earliest entry and logs it here.
 */
export default async function ToolReviewsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const st = await getT()
  const state = await getUserState()
  if (state.type !== 'member' || !state.member.is_admin) return null
  const sp = await searchParams
  const status = parseStatusTab(sp.status, 'all')
  const [{ items, total, counts }, merges] = await Promise.all([
    listSubmissions(state.member.id, { scope: 'all', status, page: 1, pageSize: PAGE }).catch(() => ({ items: [], total: 0, counts: { all: 0, pending: 0, approved: 0, rejected: 0, withdrawn: 0 } })),
    listMerges(20).catch(() => []),
  ])
  const href = (s: string) => (s === 'all' ? '/admin/tool-reviews' : `/admin/tool-reviews?status=${s}`)
  async function more(page: number) {
    'use server'
    const st = await getUserState()
    if (st.type !== 'member' || !st.member.is_admin) return { nodes: null, hasMore: false }
    const r = await listSubmissions(st.member.id, { scope: 'all', status, page, pageSize: PAGE })
    return {
      nodes: r.items.length ? (
        <ul className="sub-list">
          {r.items.map((s) => (
            <SubmissionRow key={s.id} s={s} mode="admin" dups={[]} />
          ))}
        </ul>
      ) : null,
      hasMore: page * PAGE < r.total,
    }
  }
  // legacy statuses only show up as tabs when something still carries them
  const tabs = SUBMISSION_STATUSES.filter((s) => s === 'approved' || counts[s] > 0)

  return (
    <div className="space-y-3">
      <SubPageHeader title={msg('갤러리 기록')} description={msg('멤버 AI가 올린 항목은 바로 공개돼요. 중복은 매시간 가장 먼저 올라온 항목으로 합쳐요.')} />
      <section className="card p-4 space-y-2">
        <h2 className="text-[14px] font-semibold inline-flex items-center gap-1.5" style={{ color: 'var(--n-111)' }}>
          <Merge className="w-4 h-4" /> <T>자동으로 합친 중복</T>
        </h2>
        <p className="text-[12.5px] text-n-888"><T>같은 URL이거나, 같은 사이트의 같은 이름이면 중복으로 봐요. 사용 중 표시·리뷰·올린 사람 크레딧은 남는 항목으로 옮기고, 옛 주소는 그쪽으로 이어져요.</T></p>
        {merges.length === 0 ? (
          <p className="text-[13px] text-n-888"><T>아직 합친 항목이 없어요.</T></p>
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--n-eee)' }}>
            {merges.map((m) => (
              <li key={m.id} className="py-2 text-[13px] flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 min-w-0">
                <span className="text-n-555 line-through break-all">{m.mergedName}</span>
                <span className="text-n-888">→</span>
                {m.keptSlug ? (
                  <Link href={`/gallery/${m.keptSlug}`} className="text-link font-semibold break-all">{m.keptName}</Link>
                ) : (
                  <span className="text-n-888"><T>삭제된 항목</T></span>
                )}
                <span className="tag-chip" style={{ minHeight: 22, padding: "0 8px", fontSize: 11.5 }}>{m.rule === 'same_url' ? <T>같은 URL</T> : <T>같은 사이트 · 같은 이름</T>}</span>
                <span className="text-[12px] text-n-888 ml-auto"><RelativeTime date={m.createdAt} /></span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card overflow-hidden">
        <LinkTabs label={msg('상태')} active={status} tabs={[{ id: 'all', label: st('전체'), href: href('all'), count: counts.all }, ...tabs.map((s) => ({ id: s, label: STATUS_LABEL[s], href: href(s), count: counts[s] }))]} />
      </section>
      {items.length === 0 ? (
        <div className="card p-8 text-center text-sm text-n-888">{status === 'all' ? <T>아직 올라온 항목이 없어요.</T> : <T s="{status} 항목이 없어요." vars={{ status: <T>{STATUS_LABEL[status]}</T> }} />}</div>
      ) : (
        <InfiniteList key={href(status)} className="inf-surface" hasMore={total > PAGE} load={more} storageKey={href(status)}>
          <ul className="sub-list">
            {items.map((s) => (
              <SubmissionRow key={s.id} s={s} mode="admin" dups={[]} />
            ))}
          </ul>
        </InfiniteList>
      )}
    </div>
  )
}
