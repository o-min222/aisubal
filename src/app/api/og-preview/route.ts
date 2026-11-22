import { NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { fetchLinkPreview } from '@/lib/link-preview'

export async function POST(request: NextRequest) {
  const member = await getMember()
  if (!member) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  try {
    const { url } = await request.json()
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL이 필요합니다.' }, { status: 400 })
    }
    try {
      new URL(url)
    } catch {
      return NextResponse.json({ error: '올바른 URL이 아닙니다.' }, { status: 400 })
    }

    const preview = await fetchLinkPreview(url)
    return NextResponse.json({ preview })
  } catch (error) {
    console.error('OG preview error:', error)
    return NextResponse.json({ error: '미리보기 실패' }, { status: 500 })
  }
}
