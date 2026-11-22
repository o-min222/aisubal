import { NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { listTools } from '@/lib/data/tools'
import { categoryFromLegacyType, parseToolSort } from '@/lib/tool-rules'
import { te } from '@/i18n/server'

/** Unified 툴 list: ?category=mcp|skill|prompt|rules|cli|service|launch &tag= &q= &sort=popular|newest|ai &mine=1 */
export async function GET(request: NextRequest) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const sp = request.nextUrl.searchParams
  const tools = await listTools(member.id, {
    category: categoryFromLegacyType(sp.get('category') || sp.get('type')),
    tag: sp.get('tag'),
    q: sp.get('q') || '',
    sort: parseToolSort(sp.get('sort')),
    mine: sp.get('mine') === '1' || sp.get('mine') === 'true',
  })
  return NextResponse.json({ tools })
}
