import Link from 'next/link'
import { redirect } from 'next/navigation'
import { MessageSquareText } from 'lucide-react'
import { getUserState } from '@/lib/auth'
import { listMyFeedback } from '@/lib/data/feedback'
import { myFeedbackPath } from '@/lib/feedback'
import { SubPageHeader } from '@/components/shell/sub-nav-layout'
import { FeedbackStatusBadge } from '@/components/feedback/feedback-status'
import { FeedbackThanks } from '@/components/feedback/feedback-thanks'
import { RelativeTime } from '@/components/relative-time'
import { T } from '@/i18n/t'
import { msg } from '@/i18n/translate'
import { getT } from '@/i18n/server'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('내 피드백 · AI쓰발') }
}

/** A119: the author's own 화면 피드백 and any admin reply. */
export default async function MyFeedbackPage() {
  const state = await getUserState()
  if (state.type !== 'member') redirect('/')
  const items = await listMyFeedback(state.member.id).catch(() => [])
  return (
    <>
      <SubPageHeader title={msg('내 피드백')} description={msg('화면에 남긴 피드백과 운영진의 답변이에요.')} />
      {items.length === 0 ? (
        <div className="card p-10 text-center">
          <MessageSquareText className="w-10 h-10 mx-auto mb-3 text-n-ddd" />
          <p className="text-sm text-n-888"><T>아직 남긴 피드백이 없어요.</T></p>
        </div>
      ) : (
        <ul className="card divide-y divide-n-eee">
          {items.map((f) => (
            <li key={f.id}>
              <Link href={myFeedbackPath(f.id)} className="fb-row">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 mb-0.5">
                    <FeedbackStatusBadge status={f.status} />
                    <span className="text-xs text-n-888 truncate">{f.route}</span>
                  </span>
                  <span className="block text-sm text-n-111 line-clamp-2">{f.body}</span>
                  {f.adminNote && <span className="block text-sm text-n-555 mt-1 line-clamp-2"><T s="답변: {note}" vars={{ note: f.adminNote }} /></span>}
                  <span className="block text-xs text-n-888 mt-0.5"><RelativeTime date={f.updatedAt || f.createdAt} /></span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <FeedbackThanks align="center" />
    </>
  )
}
