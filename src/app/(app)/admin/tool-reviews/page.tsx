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
import { T } from '@/i18n/t'
import { msg } from '@/i18n/translate'
import { getT } from '@/i18n/server'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('툴 검토 · 관리 · AI쓰발') }
}
const PAGE = 20

/**
 * Admin review queue (read-only on the web). Decisions are made by the
 * admin's own AI over MCP with `tools:review` (review_approve / review_reject).
 */
export default async function ToolReviewsPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const st = await getT()
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
      <SubPageHeader title={msg('툴 검토')} description={msg('멤버 AI가 보낸 등록 요청. 대기 목록은 오래된 순이에요.')} />
      <section className="card p-4 space-y-2">
        <h2 className="text-[14px] font-semibold inline-flex items-center gap-1.5" style={{ color: '#111' }}>
          <Bot className="w-4 h-4" /> <T>내 AI로 검토하기</T>
        </h2>
        <p className="text-[13px] text-[#555]">
          <T>‘툴 검토’ 권한으로</T> <Link href="/connect?preset=review" className="text-[#0066cc]"><T>AI를 연결</T></Link><T>한 뒤 아래 메시지를 보내세요. 승인·반려는 AI가 MCP로 처리하고 모두 기록돼요.</T>
        </p>
        <CodeBlock code={reviewPrompt()} label={msg('검토 메시지')} wrap />
      </section>
      <section className="card overflow-hidden">
        <LinkTabs label={msg('상태')} active={status} tabs={[...SUBMISSION_STATUSES.map((s) => ({ id: s, label: STATUS_LABEL[s], href: href(s), count: counts[s], dot: s === 'pending' && counts.pending > 0 })), { id: 'all', label: st('전체'), href: href('all'), count: counts.all }]} />
      </section>
      {items.length === 0 ? (
        <div className="card p-8 text-center text-sm text-[#888]">{status === 'pending' ? <T>대기 중인 요청이 없어요.</T> : status === 'all' ? <T>아직 요청이 없어요.</T> : <T s="{status} 요청이 없어요." vars={{ status: <T>{STATUS_LABEL[status]}</T> }} />}</div>
      ) : (
        <ul className="sub-list">
          {items.map((s, i) => (
            <SubmissionRow key={s.id} s={s} mode="admin" dups={dups[i]} />
          ))}
        </ul>
      )}
      <Pagination base={href(status)} page={page} totalPages={Math.max(1, Math.ceil(total / PAGE))} label={msg('검토 목록 페이지')} />
    </div>
  )
}
