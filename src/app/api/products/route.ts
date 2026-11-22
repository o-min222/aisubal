import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getMember } from '@/lib/auth'
import { createProduct, listProductsRanked } from '@/lib/data/products'
import type { RankingWindow } from '@/lib/product-rules'
import { te } from '@/i18n/server'

const createSchema = z.object({
  name: z.string().min(1).max(80),
  tagline: z.string().min(1).max(140),
  description: z.string().min(1).max(10000),
  logo_url: z.string().url().nullable().optional(),
  screenshots: z.array(z.string().url()).optional(),
  website_url: z.string().url().nullable().optional(),
  app_store_url: z.string().url().nullable().optional(),
  github_url: z.string().url().nullable().optional(),
  tags: z.array(z.string()).max(8).optional(),
  maker_ids: z.array(z.string()).optional(),
})

export async function GET(request: NextRequest) {
  const member = await getMember()
  if (!member) {
    return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  }
  const window = (request.nextUrl.searchParams.get('window') || 'all') as RankingWindow
  const products = await listProductsRanked(window, member.id)
  return NextResponse.json({ products, window })
}

export async function POST(request: NextRequest) {
  const member = await getMember()
  if (!member) {
    return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  }
  try {
    const data = createSchema.parse(await request.json())
    const product = await createProduct(member, data)
    return NextResponse.json({ product }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: await te(error.issues[0].message) }, { status: 400 })
    }
    console.error(error)
    return NextResponse.json({ error: await te('프로덕트 등록 실패') }, { status: 500 })
  }
}
