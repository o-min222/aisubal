import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { adminSetArticleWriter } from '@/lib/data/articles'
import { te } from '@/i18n/server'

/** A108: 관리 › 유저 — grant 작가 permission so the member can publish articles. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireAdmin() } catch { return NextResponse.json({ error: await te('권한이 없습니다.') }, { status: 403 }) }
  const { id } = await params
  const p = z.object({ on: z.boolean() }).safeParse(await request.json().catch(() => null))
  if (!p.success) return NextResponse.json({ error: await te('처리하지 못했어요.') }, { status: 400 })
  try { return NextResponse.json({ articleWriter: await adminSetArticleWriter(id, p.data.on) }) }
  catch (e) {
    console.error(e)
    return NextResponse.json({ error: await te('처리하지 못했어요.') }, { status: 500 })
  }
}
