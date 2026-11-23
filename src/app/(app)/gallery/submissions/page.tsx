import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus } from 'lucide-react'
import { getUserState } from '@/lib/auth'
import { getSubmission, listSubmissions } from '@/lib/data/tool-submissions'
import { STATUS_LABEL, SUBMISSION_STATUSES, parseStatusTab } from '@/lib/tool-review'
import { LinkTabs } from '@/components/link-tabs'
import { InfiniteList } from '@/components/infinite/infinite-list'
import { SubmissionRow } from '@/components/tools/submissions/submission-row'
import { T } from '@/i18n/t'
import { getT } from '@/i18n/server'
import { msg } from '@/i18n/translate'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('내가 올린 갤러리 항목 · AI쓰발') }
}
const PAGE = 20

/** Status of the tool submissions my AI made (statusUrl from submit_tool lands here). */
export default async function MySubmissionsPage({ searchParams }: { searchParams: Promise<{ status?: string; open?: string }> }) {
  const st = await getT()
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')
  const sp = await searchParams
  const status = parseStatusTab(sp.status, 'all')
  const { items, total, counts } = await listSubmissions(state.member.id, { scope: 'mine', status, page: 1, pageSize: PAGE }).catch(() => ({ items: [], total: 0, counts: { all: 0, pending: 0, approved: 0, rejected: 0, withdrawn: 0 } }))
  // statusUrl from submit_tool: /gallery/submissions?open=<id> pins that request (with its log) on top
  const opened = sp.open ? await getSubmission(state.member.id, sp.open).catch(() => null) : null
  const pinned = opened && opened.submission.submitterId === state.member.id ? opened : null
  const href = (s: string) => (s === 'all' ? '/gallery/submissions' : `/gallery/submissions?status=${s}`)
  const pinnedId = pinned?.submission.id ?? null
  async function more(page: number) {
    'use server'
    const st = await getUserState()
    if (st.type !== 'member') return { nodes: null, hasMore: false }
    const r = await listSubmissions(st.member.id, { scope: 'mine', status, page, pageSize: PAGE })
    const rows = r.items.filter((s) => s.id !== pinnedId)
    return {
      nodes: rows.length ? (
        <ul className="sub-list">
          {rows.map((s) => (
            <SubmissionRow key={s.id} s={s} mode="mine" />
          ))}
        </ul>
      ) : null,
      hasMore: page * PAGE < r.total,
    }
  }

  return (
    <div className="space-y-3">
      <section className="card p-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[18px] font-bold" style={{ color: 'var(--n-111)' }}>
            <T>내가 올린 갤러리 항목</T>
          </h1>
          <p className="text-[13px] text-n-666"><T>내 AI가 올린 항목이에요. 올리면 바로 공개되고, 중복이면 먼저 올라온 항목으로 합쳐져요.</T></p>
        </div>
        <Link href="/gallery/new" className="btn btn-primary btn-sm rounded-full min-h-[40px] flex-shrink-0 inline-flex items-center gap-1">
          <Plus className="w-4 h-4" /> <T>올리기</T>
        </Link>
      </section>
      <section className="card overflow-hidden">
        <LinkTabs label={msg('상태')} active={status} tabs={[{ id: 'all', label: st('전체'), href: href('all'), count: counts.all }, ...SUBMISSION_STATUSES.filter((s) => s === 'approved' || counts[s] > 0).map((s) => ({ id: s, label: STATUS_LABEL[s], href: href(s), count: counts[s] }))]} />
      </section>
      {pinned && (
        <ul className="sub-list sub-pinned" aria-label={st('방금 연 요청')}>
          <SubmissionRow s={pinned.submission} mode="mine" log={pinned.log} open />
        </ul>
      )}
      {items.length === 0 ? (
        <div className="card p-8 text-center text-sm text-n-888">
          {status === 'all' ? (
            <>
              <T>아직 요청이 없어요.</T> <Link href="/gallery/new" className="text-link"><T>내 AI에게 등록을 부탁해 보세요.</T></Link>
            </>
          ) : (
            <T s="{status} 요청이 없어요." vars={{ status: <T>{STATUS_LABEL[status]}</T> }} />
          )}
        </div>
      ) : (
        <InfiniteList key={href(status)} className="inf-surface" hasMore={total > PAGE} load={more} storageKey={href(status)}>
          <ul className="sub-list">
            {items.filter((s) => s.id !== pinned?.submission.id).map((s) => (
              <SubmissionRow key={s.id} s={s} mode="mine" />
            ))}
          </ul>
        </InfiniteList>
      )}
    </div>
  )
}
