import Link from 'next/link'
import { redirect } from 'next/navigation'
import { MessageSquareText } from 'lucide-react'
import { getUserState } from '@/lib/auth'
import { adminListFeedback } from '@/lib/data/feedback'
import { isFeedbackStatus, type FeedbackStatus } from '@/lib/feedback'
import { SubPageHeader } from '@/components/shell/sub-nav-layout'
import { FEEDBACK_STATUS_LABEL } from '@/components/feedback/feedback-status'
import { FeedbackThanks } from '@/components/feedback/feedback-thanks'
import { FeedbackInbox } from '@/components/feedback/feedback-inbox'
import { T } from '@/i18n/t'
import { msg } from '@/i18n/translate'
import { getT } from '@/i18n/server'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('관리 · 피드백 · AI쓰발') }
}

const FILTERS: Array<FeedbackStatus | null> = [null, 'pending', 'approved', 'in_progress', 'deployed', 'rejected']

/** A105: 화면 피드백 inbox — newest pending first; a row opens the screenshot + context. */
export default async function AdminFeedbackPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const state = await getUserState()
  if (state.type !== 'member' || !state.member.is_admin) redirect('/feed')
  const t = await getT()
  const sp = await searchParams
  const status = isFeedbackStatus(sp.status) ? sp.status : null
  const items = await adminListFeedback(status).catch(() => [])
  return (
    <>
      <SubPageHeader title={msg('피드백')} description={msg('멤버가 화면에서 고른 곳과 남긴 말. 승인하면 개발 요청으로 넘어가요.')} />
      <div className="flex gap-1.5 overflow-x-auto pb-3 -mx-1 px-1" role="tablist" aria-label={t('상태')}>
        {FILTERS.map((f) => (
          <Link key={f ?? 'all'} href={f ? `/admin/feedback?status=${f}` : '/admin/feedback'} role="tab" aria-selected={status === f} className={`filter-chip is-sm whitespace-nowrap ${status === f ? 'on' : ''}`}>
            {f ? t(FEEDBACK_STATUS_LABEL[f]) : t('전체')}
          </Link>
        ))}
      </div>
      {items.length === 0 ? (
        <div className="card p-10 text-center">
          <MessageSquareText className="w-10 h-10 mx-auto mb-3 text-n-ddd" />
          <p className="text-sm text-n-888"><T>아직 받은 피드백이 없어요.</T></p>
        </div>
      ) : (
        <FeedbackInbox initial={items} />
      )}
      <FeedbackThanks align="center" />
    </>
  )
}
