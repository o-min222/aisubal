import { NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { getToolboxEntry } from '@/lib/data/toolbox'
import { getMockLaunchEntry, getToolUsers, setToolUsage } from '@/lib/data/tools'

interface Params {
  params: Promise<{ id: string }>
}

async function resolve(id: string) {
  const e = (await getToolboxEntry(id).catch(() => null)) ?? (await getMockLaunchEntry(id))
  return e?.id ?? null
}

async function handle(using: boolean, { params }: Params) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  const entryId = await resolve((await params).id)
  if (!entryId) return NextResponse.json({ error: '툴을 찾을 수 없습니다.' }, { status: 404 })
  try {
    const userCount = await setToolUsage(entryId, member.id, using)
    return NextResponse.json({ ok: true, entryId, using, userCount })
  } catch (error) {
    const message = error instanceof Error ? error.message : '처리하지 못했어요.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function GET(_req: Request, { params }: Params) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  const entryId = await resolve((await params).id)
  if (!entryId) return NextResponse.json({ error: '툴을 찾을 수 없습니다.' }, { status: 404 })
  return NextResponse.json(await getToolUsers(entryId, member.id))
}

export async function POST(_req: Request, ctx: Params) {
  return handle(true, ctx)
}

export async function DELETE(_req: Request, ctx: Params) {
  return handle(false, ctx)
}
