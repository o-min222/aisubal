import { NextRequest, NextResponse } from 'next/server'
import { INVITE_COOKIE, INVITE_STATUS_TEXT, normalizeInviteCode } from '@/lib/invite-share'
import { getInvitePreview } from '@/lib/data/invites'

/**
 * Signup screen: the invite code saved by /i/{code} (httpOnly cookie), already
 * validated. Unusable codes clear the cookie so the waitlist takes over.
 */
export async function GET(request: NextRequest) {
  const code = normalizeInviteCode(request.cookies.get(INVITE_COOKIE)?.value)
  if (!code) return NextResponse.json({ code: null })
  const preview = await getInvitePreview(code)
  const valid = preview.status === 'valid'
  const res = NextResponse.json({
    code,
    valid,
    status: preview.status,
    message: INVITE_STATUS_TEXT[preview.status],
    inviter: preview.inviter ? { displayName: preview.inviter.displayName, avatarUrl: preview.inviter.avatarUrl } : null,
  })
  if (!valid) res.cookies.delete(INVITE_COOKIE)
  return res
}
