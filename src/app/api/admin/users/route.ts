import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { adminListUsers } from '@/lib/data/admin'
import { te } from '@/i18n/server'

export async function GET() {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: await te('권한이 없습니다.') }, { status: 403 })
  }

  try {
    const users = await adminListUsers()
    return NextResponse.json({ users })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: await te('사용자 목록을 불러오지 못했습니다.') }, { status: 500 })
  }
}
