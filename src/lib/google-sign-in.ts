'use client'

import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { tn } from '@/i18n/client'

/**
 * Start Google sign-in. On success the browser leaves the page; when it can't start (network, auth
 * config) say so instead of leaving the button doing nothing. Returns false on failure.
 */
export async function startGoogleSignIn(): Promise<boolean> {
  try {
    const { error } = await createClient().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback` } })
    if (error) throw error
    return true
  } catch (e) {
    console.error('signInWithOAuth', e)
    toast.error(tn('Google 로그인을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.'))
    return false
  }
}
