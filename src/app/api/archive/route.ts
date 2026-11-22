import { NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { addToArchive, getArchiveItemByRef, listArchive, removeArchiveByRef } from '@/lib/data/archive'
import { isArchiveKind } from '@/lib/archive-rules'
import { te } from '@/i18n/server'

/** My archive: filtered, searched, numbered pages. */
export async function GET(req: NextRequest) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const sp = req.nextUrl.searchParams
  const kind = sp.get('kind')
  // one saved item by source (the '담김' sheet): GET /api/archive?kind=post&ref=…
  const ref = sp.get('ref')
  if (ref) {
    if (!isArchiveKind(kind)) return NextResponse.json({ error: await te('담을 항목을 찾을 수 없어요.') }, { status: 400 })
    const item = await getArchiveItemByRef(member.id, kind, ref.slice(0, 2048))
    return item ? NextResponse.json({ item }) : NextResponse.json({ error: await te('아카이브에서 찾지 못했어요.') }, { status: 404 })
  }
  const page = await listArchive(member.id, {
    kind: isArchiveKind(kind) ? kind : null,
    tag: sp.get('tag')?.slice(0, 24) || null,
    q: sp.get('q')?.slice(0, 100) || null,
    page: Number(sp.get('page')) || 1,
  })
  return NextResponse.json(page)
}

/** '아카이브에 담기': save anything (resolved server-side), optional memo/tags. Idempotent. */
export async function POST(req: Request) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || !isArchiveKind(body.kind) || typeof body.ref !== 'string' || !body.ref.trim()) {
    return NextResponse.json({ error: await te('담을 항목을 찾을 수 없어요.') }, { status: 400 })
  }
  const hint = body.hint && typeof body.hint === 'object' ? (body.hint as Record<string, string>) : undefined
  const r = await addToArchive(member, { kind: body.kind, ref: body.ref.slice(0, 2048), memo: body.memo as string | undefined, tags: body.tags, hint })
  if (!r.ok) {
    const msg = r.error === 'bad_url' ? '저장할 수 없는 주소예요.' : r.error === 'not_found' ? '담을 항목을 찾을 수 없어요.' : r.error === 'full' ? '아카이브가 가득 찼어요. 오래된 항목을 정리해 주세요.' : '아카이브에 담지 못했어요.'
    return NextResponse.json({ error: await te(msg) }, { status: r.error === 'failed' ? 500 : 400 })
  }
  return NextResponse.json(r)
}

/** Unsave by source: DELETE /api/archive?kind=post&ref=… */
export async function DELETE(req: NextRequest) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const kind = req.nextUrl.searchParams.get('kind')
  const ref = req.nextUrl.searchParams.get('ref')
  if (!isArchiveKind(kind) || !ref) return NextResponse.json({ error: await te('담을 항목을 찾을 수 없어요.') }, { status: 400 })
  await removeArchiveByRef(member.id, kind, ref)
  return NextResponse.json({ ok: true })
}
