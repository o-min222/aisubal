import { NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { toggleProductUpvote } from '@/lib/data/products'

interface Params {
  params: Promise<{ id: string }>
}

export async function POST(_request: NextRequest, { params }: Params) {
  const member = await getMember()
  if (!member) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }
  const { id } = await params
  try {
    const product = await toggleProductUpvote(id, member.id, 'add')
    return NextResponse.json({ product })
  } catch (error) {
    const message = error instanceof Error ? error.message : '업보트 실패'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const member = await getMember()
  if (!member) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }
  const { id } = await params
  try {
    const product = await toggleProductUpvote(id, member.id, 'remove')
    return NextResponse.json({ product })
  } catch (error) {
    const message = error instanceof Error ? error.message : '업보트 취소 실패'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
