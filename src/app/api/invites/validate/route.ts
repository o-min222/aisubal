import { NextRequest, NextResponse } from 'next/server'
import { validateInviteCode } from '@/lib/data/invites'
import { z } from 'zod'
import { msg } from '@/i18n/translate'
import { te } from '@/i18n/server'

const validateSchema = z.object({
  code: z.string().length(8, msg('초대 코드는 8자리입니다.')),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { code } = validateSchema.parse(body)
    const result = await validateInviteCode(code.toUpperCase())
    if (!result.valid) {
      return NextResponse.json({ valid: false, error: await te(result.error || msg('유효하지 않은 초대 코드입니다.')) })
    }
    return NextResponse.json({ valid: true, inviter: result.inviter })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ valid: false, error: await te(error.issues[0].message) }, { status: 400 })
    }
    return NextResponse.json({ valid: false, error: await te('오류가 발생했습니다.') }, { status: 500 })
  }
}
