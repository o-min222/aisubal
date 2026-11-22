import Link from 'next/link'
import { Bot } from 'lucide-react'
import { getUserState } from '@/lib/auth'
import { duplicateHints, listSubmissions } from '@/lib/data/tool-submissions'
import { STATUS_LABEL, SUBMISSION_STATUSES, parseStatusTab, reviewPrompt } from '@/lib/tool-review'
import { LinkTabs } from '@/components/link-tabs'
import { InfiniteList } from '@/components/infinite/infinite-list'
import { SubPageHeader } from '@/components/shell/sub-nav-layout'
import { CodeBlock } from '@/components/connect/code-block'
import { SubmissionRow } from '@/components/tools/submissions/submission-row'
import { T } from '@/i18n/t'
import { msg } from '@/i18n/translate'
import { getT } from '@/i18n/server'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('갤러리 검토 · 관리 · AI쓰발') }
}
const PAGE = 20

/**
 * Admin review queue. The admin's AI reviews over MCP (`tools:review`): rejects
 * directly, approvals only as 'AI 추천' that a human confirms here (P-4).
 */
export default async function ToolReviewsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const st = await getT()
  const state = await getUserState()
  if (state.type !== 'member' || !state.member.is_admin) return null
  const sp = await searchParams
  const status = parseStatusTab(sp.status, 'pending')
  const { items, total, counts } = await listSubmissions(state.member.id, { scope: 'all', status, page: 1, pageSize: PAGE }).catch(() => ({ items: [], total: 0, counts: { all: 0, pending: 0, approved: 0, rejected: 0, withdrawn: 0 } }))
  const dups = status === 'pending' ? await Promise.all(items.map((s) => duplicateHints(s).catch(() => []))) : items.map(() => [])
  const href = (s: string) => (s === 'pending' ? '/admin/tool-reviews' : `/admin/tool-reviews?status=${s}`)
  async function more(page: number) {
    'use server'
    const st = await getUserState()
    if (st.type !== 'member' || !st.member.is_admin) return { nodes: null, hasMore: false }
    const r = await listSubmissions(st.member.id, { scope: 'all', status, page, pageSize: PAGE })
    const d = status === 'pending' ? await Promise.all(r.items.map((s) => duplicateHints(s).catch(() => []))) : r.items.map(() => [])
    return {
      nodes: r.items.length ? (
        <ul className="sub-list">
          {r.items.map((s, i) => (
            <SubmissionRow key={s.id} s={s} mode="admin" dups={d[i]} />
          ))}
        </ul>
      ) : null,
      hasMore: page * PAGE < r.total,
    }
  }

  return (
    <div className="space-y-3">
      <SubPageHeader title={msg('갤러리 검토')} description={msg('멤버 AI가 보낸 등록 요청. 대기 목록은 오래된 순이에요.')} />
      <section className="card p-4 space-y-2">
        <h2 className="text-[14px] font-semibold inline-flex items-center gap-1.5" style={{ color: 'var(--n-111)' }}>
          <Bot className="w-4 h-4" /> <T>내 AI로 검토하기</T>
        </h2>
        <p className="text-[13px] text-n-555">
          <T s="‘갤러리 검토’ 권한으로 {connect}한 뒤 아래 메시지를 보내세요. 반려는 AI가 MCP로 처리하고, AI가 추천한 승인은 여기서 ‘승인 확정’을 눌러야 공개돼요. 모두 기록돼요." vars={{ connect: <Link href="/agents/connect?preset=review" className="text-c-06c"><T>AI를 연결</T></Link> }} />
        </p>
        <CodeBlock code={reviewPrompt()} label={msg('검토 메시지')} wrap />
      </section>
      <section className="card overflow-hidden">
        <LinkTabs label={msg('상태')} active={status} tabs={[...SUBMISSION_STATUSES.map((s) => ({ id: s, label: STATUS_LABEL[s], href: href(s), count: counts[s], dot: s === 'pending' && counts.pending > 0 })), { id: 'all', label: st('전체'), href: href('all'), count: counts.all }]} />
      </section>
      {items.length === 0 ? (
        <div className="card p-8 text-center text-sm text-n-888">{status === 'pending' ? <T>대기 중인 요청이 없어요.</T> : status === 'all' ? <T>아직 요청이 없어요.</T> : <T s="{status} 요청이 없어요." vars={{ status: <T>{STATUS_LABEL[status]}</T> }} />}</div>
      ) : (
        <InfiniteList key={href(status)} className="inf-surface" hasMore={total > PAGE} load={more} storageKey={href(status)}>
          <ul className="sub-list">
            {items.map((s, i) => (
              <SubmissionRow key={s.id} s={s} mode="admin" dups={dups[i]} />
            ))}
          </ul>
        </InfiniteList>
      )}
    </div>
  )
}
