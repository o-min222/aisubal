import { createClient } from '@/lib/supabase/server'

/** True when the app should serve in-memory mock data (local DEV bypass). */
export function isMock(): boolean {
  return process.env.DEV_BYPASS_AUTH === 'true'
}

/** Cookie-scoped Supabase server client (anon key + user session). */
export async function sb() {
  return createClient()
}
