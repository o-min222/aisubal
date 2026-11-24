'use server'

import { updateTag } from 'next/cache'
import { getMember } from '@/lib/auth'
import { PEEK_TAG } from '@/lib/landing-peek-rules'

/** A64/A65: after an opt-out or the admin switch, the very next landing view is fresh (read-your-own-writes). */
export async function refreshLandingPeek(): Promise<void> {
  const member = await getMember()
  if (!member) return
  updateTag(PEEK_TAG)
}
