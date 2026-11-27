import { FEEDBACK_THANKS } from '@/lib/feedback'

/** A107: muted credit for the idea. Same English wording in every locale. */
export function FeedbackThanks({ align = 'start' }: { align?: 'start' | 'center' }) {
  return <p className={`fb-thanks is-${align}`}>{FEEDBACK_THANKS}</p>
}
