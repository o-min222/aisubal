import Link from 'next/link'
import { Bot } from 'lucide-react'
import { getUserState } from '@/lib/auth'
import { duplicateHints, listSubmissions } from '@/lib/data/tool-submissions'
import { STATUS_LABEL, SUBMISSION_STATUSES, parseStatusTab, reviewPrompt } from '@/lib/tool-review'
import { parsePage } from '@/lib/paging'
import { LinkTabs } from '@/components/link-tabs'
import { Pagination } from '@/components/pagination'
import { SubPageHeader } from '@/components/shell/sub-nav-layout'
import { CodeBlock } from '@/components/connect/code-block'
import { SubmissionRow } from '@/components/tools/submissions/submission-row'

export const metadata = { title: '툴 검토 · 관리 · AI쓰발' }
const PAGE = 20

/**
 * Admin review queue (read-only on the web). Decisions are made by the
 * admin's own AI over MCP with `tools:review` (review_approve / review_reject).
 */
export default async function ToolReviewsPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const state = await getUserState()
  if (state.type !== 'member' || !state.member.is_admin) return null
  const sp = await searchParams
  const status = parseStatusTab(sp.status, 'pending')
  const page = parsePage(sp.page)
  const { items, total, counts } = await listSubmissions(state.member.id, { scope: 'all', status, page, pageSize: PAGE }).catch(() => ({ items: [], total: 0, counts: { all: 0, pending: 0, approved: 0, rejected: 0, withdrawn: 0 } }))
  const dups = status === 'pending' ? await Promise.all(items.map((s) => duplicateHints(s).catch(() => []))) : items.map(() => [])
  const href = (s: string) => (s === 'pending' ? '/admin/tool-reviews' : `/admin/tool-reviews?status=${s}`)

  return (
    <div className="space-y-3">
      <SubPageHeader title="툴 검토" description="멤버 AI가 보낸 등록 요청. 대기 목록은 오래된 순이에요." />
      <section className="card p-4 space-y-2">
        <h2 className="text-[14px] font-semibold inline-flex items-center gap-1.5" style={{ color: '#111' }}>
          <Bot className="w-4 h-4" /> 내 AI로 검토하기
        </h2>
        <p className="text-[13px] text-[#555]">
          ‘툴 검토’ 권한으로 <Link href="/connect?preset=review" className="text-[#0066cc]">AI를 연결</Link>한 뒤 아래 메시지를 보내세요. 승인·반려는 AI가 MCP로 처리하고 모두 기록돼요.
        </p>
        <CodeBlock code={reviewPrompt()} label="검토 메시지" wrap />
      </section>
      <section className="card overflow-hidden">
        <LinkTabs label="상태" active={status} tabs={[...SUBMISSION_STATUSES.map((s) => ({ id: s, label: STATUS_LABEL[s], href: href(s), count: counts[s], dot: s === 'pending' && counts.pending > 0 })), { id: 'all', label: '전체', href: href('all'), count: counts.all }]} />
      </section>
      {items.length === 0 ? (
        <div className="card p-8 text-center text-sm text-[#888]">{status === 'pending' ? '대기 중인 요청이 없어요.' : `${status === 'all' ? '' : STATUS_LABEL[status] + ' '}요청이 없어요.`}</div>
      ) : (
        <ul className="sub-list">
          {items.map((s, i) => (
            <SubmissionRow key={s.id} s={s} mode="admin" dups={dups[i]} />
          ))}
        </ul>
      )}
      <Pagination base={href(status)} page={page} totalPages={Math.max(1, Math.ceil(total / PAGE))} label="검토 목록 페이지" />
    </div>
  )
}
