import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { INVITE_COOKIE } from '@/lib/invite-share'
import { cookies } from 'next/headers'
import { AFTER_LOGIN_COOKIE, safeNextPath } from '@/lib/handoff-rules'

/**
 * OAuth callback.
 *
 * Uses only the signed-in user's own session (anon key + RLS). The
 * handle_new_user trigger already creates the waitlist + pending member rows
 * on first sign-in; ensure_waitlist() is a SECURITY DEFINER RPC that backfills
 * them if the trigger ever missed. No service-role key is needed here.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // ?next, or the path /h saved before a phone sign-in (same-origin relative paths only)
  const jar = await cookies()
  const next = safeNextPath(searchParams.get('next')) ?? safeNextPath(jar.get(AFTER_LOGIN_COOKIE)?.value) ?? '/feed'

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`)
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.user) {
    console.error('[auth/callback] exchangeCodeForSession failed', error?.message)
    return NextResponse.redirect(`${origin}/login?error=auth_failed`)
  }

  const { data: member, error: memberError } = await supabase
    .from('members')
    .select('id, signup_completed_at, is_banned')
    .eq('auth_id', data.user.id)
    .maybeSingle()

  if (memberError) {
    console.error('[auth/callback] member lookup failed', memberError.message)
  }

  if (member?.signup_completed_at && !member.is_banned) {
    // already a member: an invite link they followed has nothing left to do
    const res = NextResponse.redirect(`${origin}${next}`)
    res.cookies.delete(INVITE_COOKIE)
    res.cookies.delete(AFTER_LOGIN_COOKIE)
    return res
  }

  // Not a completed member yet: make sure the waitlist row exists, then send
  // them to the invite-code screen (it fills in a code saved by /i/{code}).
  const { error: waitlistError } = await supabase.rpc('ensure_waitlist')
  if (waitlistError) {
    console.error('[auth/callback] ensure_waitlist failed', waitlistError.message)
  }

  return NextResponse.redirect(`${origin}/waitlist`)
}
