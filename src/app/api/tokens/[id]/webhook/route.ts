import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getMember } from '@/lib/auth'
import { deleteAgentWebhook, getAgentWebhook, pingAgentWebhook, saveAgentWebhook } from '@/lib/data/agent-webhooks'
import { checkWebhookUrl, resolvesPublic } from '@/lib/safe-fetch'
import { kickWebhookWorker } from '@/lib/agent-webhooks'
import { te } from '@/i18n/server'
import { isMock } from '@/lib/data/client'

const NO_STORE = { 'Cache-Control': 'no-store' }

async function fail(e: unknown) {
  const m = e instanceof Error ? e.message : ''
  if (m.includes('agent_not_found')) return NextResponse.json({ error: await te('토큰을 찾을 수 없어요.') }, { status: 404 })
  if (m.includes('webhook_bad_url')) return NextResponse.json({ error: await te('https:// 로 시작하는 공개 주소만 쓸 수 있어요.') }, { status: 422 })
  if (m.includes('webhook_rate_limited')) return NextResponse.json({ error: await te('테스트는 한 시간에 10번까지예요.') }, { status: 429 })
  console.error(e)
  return NextResponse.json({ error: await te('웹훅을 저장하지 못했어요.') }, { status: 500 })
}

/** 웹훅 (선택): the agent's mention/reply webhook — owner only. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const { id } = await params
  try {
    return NextResponse.json({ webhook: await getAgentWebhook(id) }, { headers: NO_STORE })
  } catch (e) {
    return fail(e)
  }
}

const putSchema = z.object({ url: z.string().trim().min(8).max(500), rotate: z.boolean().optional() })

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const { id } = await params
  const parsed = putSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: await te('잘못된 요청이에요.') }, { status: 400 })
  const check = checkWebhookUrl(parsed.data.url)
  // DEV mock never delivers, so the live DNS check is production-only (delivery re-checks at connect anyway)
  if (!check.ok || (!isMock() && !(await resolvesPublic(check.url.hostname)))) {
    return NextResponse.json({ error: await te('https:// 로 시작하는 공개 주소만 쓸 수 있어요.') }, { status: 422 })
  }
  try {
    const url = check.url.toString()
    return NextResponse.json({ webhook: await saveAgentWebhook(id, url, parsed.data.rotate === true) }, { headers: NO_STORE })
  } catch (e) {
    return fail(e)
  }
}

/** Sends a test 'ping' delivery. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const { id } = await params
  try {
    await pingAgentWebhook(id)
    kickWebhookWorker()
    return NextResponse.json({ ok: true })
  } catch (e) {
    return fail(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const { id } = await params
  try {
    await deleteAgentWebhook(id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return fail(e)
  }
}
