import { NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { getProfileStack, saveProfileStack } from '@/lib/data/profile-stack'
import { cleanStackItems, type StackGroup } from '@/lib/profile-stack'
import type { LinkVisibility } from '@/lib/profile-rules'

const VIS: LinkVisibility[] = ['members', 'friends', 'private']
const GROUPS: StackGroup[] = ['ai', 'subs', 'skills']

export async function GET() {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  return NextResponse.json(await getProfileStack(member.id, member.id))
}

/** Replace-all save of 활용하는 AI / 구독 / 스킬 extras + per-group visibility. */
export async function PUT(req: Request) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body !== 'object') return NextResponse.json({ error: '형식이 올바르지 않아요.' }, { status: 400 })
  const visIn = (body.vis ?? {}) as Record<string, unknown>
  const items = (g: StackGroup) => cleanStackItems(Array.isArray(body[g]) ? (body[g] as Array<{ label: string; entryId?: string | null }>) : [])
  const input = {
    ai: items('ai'),
    subs: items('subs'),
    skills: items('skills'),
    vis: Object.fromEntries(GROUPS.map((g) => [g, VIS.includes(visIn[g] as LinkVisibility) ? visIn[g] : 'members'])) as Record<StackGroup, LinkVisibility>,
  }
  try {
    await saveProfileStack(member.id, input)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: '저장하지 못했어요. 입력값을 확인해 주세요.' }, { status: 400 })
  }
}
