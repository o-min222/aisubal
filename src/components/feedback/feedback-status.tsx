import { T } from '@/i18n/t'
import { msg } from '@/i18n/translate'
import type { FeedbackStatus } from '@/lib/feedback'

export const FEEDBACK_STATUS_LABEL: Record<FeedbackStatus, string> = {
  pending: msg('새 피드백'),
  approved: msg('승인됨'),
  rejected: msg('거절됨'),
  in_progress: msg('진행 중'),
  deployed: msg('배포됨'),
}

export function FeedbackStatusBadge({ status }: { status: FeedbackStatus }) {
  return (
    <span className={`fb-status is-${status}`}>
      <T s={FEEDBACK_STATUS_LABEL[status]} />
    </span>
  )
}
