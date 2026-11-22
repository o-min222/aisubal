import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getMember } from '@/lib/auth'
import { groupMembership, listGroupMembers, updateGroup, type MembershipAction } from '@/lib/data/groups'
import { GROUP_SLUG_RE, groupErrorMessage } from '@/lib/group-rules'
import { te } from '@/i18n/server'

const updateSchema = z.object({
  name: z.string().trim().min(2).max(40),
  description: z.string().trim().max(500).default(''),
  joinPolicy: z.enum(['open', 'approval']),
  isHidden: z.boolean(),
  // 0060: the owner may change the address; the old one redirects
  slug: z.string().trim().toLowerCase().regex(GROUP_SLUG_RE).optional(),
})

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('join'), message: z.string().max(200).nullish() }),
  z.object({ action: z.literal('leave') }),
  z.object({ action: z.literal('decide'), memberId: z.string().min(1).max(64), accept: z.boolean() }),
  z.object({ action: z.literal('invite'), memberId: z.string().min(1).max(64) }),
  z.object({ action: z.literal('role'), memberId: z.string().min(1).max(64), role: z.enum(['owner', 'mod', 'member']) }),
  z.object({ action: z.literal('remove'), memberId: z.string().min(1).max(64) }),
  z.object({ action: z.literal('delete') }),
])

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const { id } = await params
  return NextResponse.json({ members: await listGroupMembers(member.id, id) })
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const { id } = await params
  const parsed = updateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: await te('입력값을 확인해주세요.') }, { status: 400 })
  try {
    const { slug } = await updateGroup(member.id, id, { ...parsed.data, emoji: null })
    return NextResponse.json({ ok: true, slug })
  } catch (e) {
    return NextResponse.json({ error: await te(groupErrorMessage(e)) }, { status: 400 })
  }
}

/** Membership actions: join / leave / decide / invite / role / remove / delete. */
export async function POST(request: NextRequest, { params }: Ctx) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const { id } = await params
  const parsed = actionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: await te('요청 형식이 올바르지 않아요.') }, { status: 400 })
  try {
    const result = await groupMembership(member.id, id, parsed.data as MembershipAction)
    return NextResponse.json({ result })
  } catch (e) {
    return NextResponse.json({ error: await te(groupErrorMessage(e)) }, { status: 400 })
  }
}
