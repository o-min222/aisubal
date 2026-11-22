import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { getInviteTree } from '@/lib/data/invites'
import { te } from '@/i18n/server'

export async function GET() {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: await te('권한이 없습니다.') }, { status: 403 })
  }

  try {
    const tree = await getInviteTree()
    return NextResponse.json({ tree })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: await te('초대 트리를 불러오지 못했습니다.') }, { status: 500 })
  }
}
