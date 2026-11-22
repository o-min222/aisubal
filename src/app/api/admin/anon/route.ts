import { NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { adminAnonLog, adminListAnon, type AnonAdminFilter } from '@/lib/data/anon'
import { anonError } from '@/lib/anon-rules'

/** Admin moderation queue. The RPC re-checks is_admin in the database. */
export async function GET(request: NextRequest) {
  const member = await getMember()
  if (!member?.is_admin) return NextResponse.json({ error: '운영자만 할 수 있어요.' }, { status: 403 })
  const f = request.nextUrl.searchParams.get('filter')
  const filter: AnonAdminFilter = f === 'reported' || f === 'all' ? f : 'hidden'
  try {
    const [posts, log] = await Promise.all([adminListAnon(member.id, filter), adminAnonLog()])
    return NextResponse.json({ posts, log })
  } catch (e) {
    const { status, error } = anonError(e)
    return NextResponse.json({ error }, { status })
  }
}
