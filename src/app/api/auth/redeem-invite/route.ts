import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { useMockData } from '@/lib/data/client'

export async function POST(request: NextRequest) {
  try {
    const { code } = await request.json()

    if (!code || typeof code !== 'string' || code.length !== 8) {
      return NextResponse.json({ error: '유효하지 않은 초대 코드입니다.' }, { status: 400 })
    }

    // Dev bypass: accept any 8-char code for local review
    if (useMockData()) {
      return NextResponse.json({
        success: true,
        member: {
          id: 'dev-user-id',
          display_name: '개발자',
        },
        needsProfile: true,
      })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
    }

    const { data, error } = await supabase.rpc('redeem_invite', {
      p_code: code,
    })

    if (error) {
      console.error('redeem_invite error:', error)
      return NextResponse.json({ error: '가입 처리 중 오류가 발생했습니다.' }, { status: 500 })
    }

    const result = data as {
      ok?: boolean
      error?: string
      member?: { id: string; display_name: string }
      needs_profile?: boolean
    }

    if (!result?.ok) {
      return NextResponse.json(
        { error: result?.error || '초대 코드 처리에 실패했습니다.' },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      member: result.member,
      needsProfile: result.needs_profile !== false,
    })
  } catch (error) {
    console.error('Redeem invite error:', error)
    return NextResponse.json({ error: '처리 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
