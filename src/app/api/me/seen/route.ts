import { NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { sb, isMock } from '@/lib/data/client'

/** A61: "this member is here" for the 새 소식 digest (skips anyone seen in the last 4 h). Throttled in SQL too. */
export async function POST() {
  const member = await getMember()
  if (!member) return NextResponse.json({ ok: false }, { status: 401 })
  if (!isMock()) {
    const supabase = await sb()
    await supabase.rpc('member_seen').then(() => null, () => null)
  }
  return NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store' } })
}
