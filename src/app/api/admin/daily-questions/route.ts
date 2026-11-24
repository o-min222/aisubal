import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { adminDeleteQuestion, adminListQuestions, adminSaveQuestion } from '@/lib/data/daily-question'
import { te } from '@/i18n/server'

/** A62: admin-editable 오늘의 질문 pool (one per KST day, in order). */
async function guard() {
  try {
    await requireAdmin()
    return null
  } catch {
    return NextResponse.json({ error: await te('권한이 없습니다.') }, { status: 403 })
  }
}

export async function GET() {
  const no = await guard()
  if (no) return no
  return NextResponse.json(await adminListQuestions())
}

const schema = z.object({
  id: z.string().max(64).nullish(),
  ko: z.string().trim().min(4).max(140),
  en: z.string().trim().max(140).nullish(),
  active: z.boolean().optional(),
})

export async function POST(req: NextRequest) {
  const no = await guard()
  if (no) return no
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: await te('질문은 4~140자로 적어 주세요.') }, { status: 400 })
  try {
    return NextResponse.json(await adminSaveQuestion(parsed.data))
  } catch (e) {
    console.error('[admin] daily question save failed', e)
    return NextResponse.json({ error: await te('저장하지 못했어요.') }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const no = await guard()
  if (no) return no
  const id = req.nextUrl.searchParams.get('id') || ''
  if (!id || id.length > 64) return NextResponse.json({ error: await te('잘못된 요청이에요.') }, { status: 400 })
  try {
    return NextResponse.json(await adminDeleteQuestion(id))
  } catch (e) {
    console.error('[admin] daily question delete failed', e)
    return NextResponse.json({ error: await te('삭제하지 못했어요.') }, { status: 500 })
  }
}
