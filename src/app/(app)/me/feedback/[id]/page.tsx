import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getUserState } from '@/lib/auth'
import { getMyFeedback } from '@/lib/data/feedback'
import { myFeedbackPath } from '@/lib/feedback'
import { FeedbackStatusBadge } from '@/components/feedback/feedback-status'
import { FeedbackThanks } from '@/components/feedback/feedback-thanks'
import { RelativeTime } from '@/components/relative-time'
import { T } from '@/i18n/t'
import { getT } from '@/i18n/server'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('내 피드백 · AI쓰발') }
}

export default async function MyFeedbackDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const state = await getUserState()
  if (state.type !== 'member') redirect('/')
  const { id } = await params
  const t = await getT()
  const f = await getMyFeedback(state.member.id, id).catch(() => null)
  if (!f) notFound()
  return (
    <div className="space-y-3">
      <Link href={myFeedbackPath()} className="inline-flex items-center gap-1 text-sm text-n-555 min-h-[36px]">
        <ArrowLeft className="w-4 h-4" />
        <T>내 피드백</T>
      </Link>
      <div className="card p-4 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <FeedbackStatusBadge status={f.status} />
          <span className="text-xs text-n-888">{f.route} · <RelativeTime date={f.createdAt} /></span>
        </div>
        <p className="text-[15px] text-n-111 whitespace-pre-wrap break-words">{f.body}</p>
      </div>
      {f.hasShot && (
        <a href={`/api/feedback-shot/${f.id}`} target="_blank" rel="noreferrer" className="card block overflow-hidden fb-shot">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/feedback-shot/${f.id}`} alt={t('피드백 스크린샷')} />
        </a>
      )}
      {(f.adminNote || f.progressNote) ? (
        <div className="card p-4 space-y-2">
          <h2 className="text-sm font-semibold text-n-111"><T>운영진 답변</T></h2>
          {f.adminNote && (
            <p className="text-[15px] text-n-111 whitespace-pre-wrap break-words">{f.adminNote}</p>
          )}
          {f.progressNote && (
            <p className="text-sm text-n-555">
              <T s="진행 메모: {note}" vars={{ note: f.progressNote }} />
              {f.progressAt && <> · <RelativeTime date={f.progressAt} /></>}
            </p>
          )}
          {f.reviewedAt && <p className="text-xs text-n-888"><RelativeTime date={f.reviewedAt} /></p>}
        </div>
      ) : (
        <p className="text-sm text-n-888 px-1"><T>아직 답변이 없어요. 검토되면 알림으로 알려 드려요.</T></p>
      )}
      <FeedbackThanks align="center" />
    </div>
  )
}
