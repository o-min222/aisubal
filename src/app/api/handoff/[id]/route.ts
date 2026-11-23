import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getMember } from '@/lib/auth'
import { handoffStatus } from '@/lib/data/handoff'

/** Desktop polls its own handoff: pending → completed (phone signed in) | expired. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const member = await getMember()
  if (!member || !z.string().uuid().safeParse(id).success) return NextResponse.json({ status: null }, { status: 404, headers: { 'Cache-Control': 'no-store' } })
  return NextResponse.json({ status: await handoffStatus(member.id, id) }, { headers: { 'Cache-Control': 'no-store' } })
}
