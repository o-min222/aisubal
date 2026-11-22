import { NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { savedArchiveKeys } from '@/lib/data/archive'

/** 'kind:ref' keys of everything I saved: one request feeds every bookmark button. */
export async function GET() {
  const member = await getMember()
  if (!member) return NextResponse.json({ keys: [] })
  return NextResponse.json({ keys: await savedArchiveKeys(member.id) }, { headers: { 'Cache-Control': 'private, no-store' } })
}
