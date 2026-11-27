import type { Member } from '@/lib/supabase/types'

/** Redirect to /pledge when the member has not signed. A missing or empty timestamp counts as unsigned. */
export function memberNeedsPledge(member: Pick<Member, 'pledge_signed_at'>): boolean {
  return !member.pledge_signed_at
}
