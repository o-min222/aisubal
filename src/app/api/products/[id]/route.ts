import { NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { getProductDetails } from '@/lib/data/products'

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(_request: NextRequest, { params }: Params) {
  const member = await getMember()
  if (!member) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }
  const { id } = await params
  const product = await getProductDetails(id, member.id)
  if (!product) {
    return NextResponse.json({ error: '프로덕트를 찾을 수 없습니다.' }, { status: 404 })
  }
  return NextResponse.json({ product })
}
