import { NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { getPostAsset } from '@/lib/data/posts'
import { te } from '@/i18n/server'

interface RouteParams {
  params: Promise<{ id: string; assetId: string }>
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const member = await getMember()
  if (!member) {
    return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  }

  const { id, assetId } = await params
  const asset = await getPostAsset(id, assetId)
  if (!asset) {
    return NextResponse.json({ error: await te('에셋을 찾을 수 없습니다.') }, { status: 404 })
  }

  return NextResponse.json({ asset })
}
