import { cache } from 'react'
import { cookies } from 'next/headers'
import { getUserState } from '@/lib/auth'
import { THEME_COOKIE, isTheme, type Theme } from '@/lib/theme'

/** Explicit cookie → the member's saved choice (new device) → follow the OS. */
export const getTheme = cache(async (): Promise<Theme> => {
  const c = (await cookies()).get(THEME_COOKIE)?.value
  if (isTheme(c)) return c
  try {
    const state = await getUserState()
    const saved = state.type === 'member' ? state.member.theme : null
    if (isTheme(saved)) return saved
  } catch {
    // signed out: follow the OS
  }
  return 'system'
})
