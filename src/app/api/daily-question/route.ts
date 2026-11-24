import { NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { getTodayQuestion } from '@/lib/data/daily-question'
import { te } from '@/i18n/server'

/** A62: today's question (KST), whether I answered, and how many did. */
export async function GET() {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  try {
    return NextResponse.json({ question: await getTodayQuestion() })
  } catch (e) {
    console.error('[daily-question] failed', e)
    return NextResponse.json({ question: null })
  }
}
