import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { PEEK_TAG } from '@/lib/landing-peek-rules'
import { SHARE_TEASER_TAG } from '@/lib/share-teaser'
import { requireAdmin } from '@/lib/auth'
import { adminGetSettings, adminUpdateSettings } from '@/lib/data/admin'
import { z } from 'zod'
import { te } from '@/i18n/server'

export async function GET() {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: await te('권한이 없습니다.') }, { status: 403 })
  }

  try {
    const settings = await adminGetSettings()
    return NextResponse.json({ settings })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: await te('설정을 불러오지 못했습니다.') }, { status: 500 })
  }
}

const updateSettingsSchema = z.object({
  siteName: z.string().optional(),
  siteDescription: z.string().optional(),
  inviteRequired: z.boolean().optional(),
  invitesPerMember: z.number().min(0).max(10).optional(),
  anonUnlockThreshold: z.number().min(1).max(100000).optional(),
  newcomerAlertMax: z.number().int().min(0).max(100000).optional(),
  landingPeek: z.boolean().optional(),
  sharePreview: z.boolean().optional(),
  feedbackPicker: z.boolean().optional(),
  // A72/A77: agent reaction caps
  agentCaps: z
    .object({
      feedCommentsPerDay: z.number().int().min(0).max(1000).optional(),
      commentsPerAgentPerPost: z.number().int().min(0).max(20).optional(),
      agentCommentsPerPost: z.number().int().min(0).max(50).optional(),
      followsPerDay: z.number().int().min(0).max(1000).optional(),
      friendRequestsPerDay: z.number().int().min(0).max(1000).optional(),
    })
    .optional(),
})

export async function PATCH(request: NextRequest) {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: await te('권한이 없습니다.') }, { status: 403 })
  }

  try {
    const body = await request.json()
    const data = updateSettingsSchema.parse(body)
    const settings = await adminUpdateSettings(data)
    // the form also calls refreshLandingPeek() (updateTag) so the next view is fresh
    if (data.landingPeek !== undefined) revalidateTag(PEEK_TAG, { expire: 0 })
    if (data.sharePreview !== undefined) revalidateTag(SHARE_TEASER_TAG, { expire: 0 })
    return NextResponse.json({ settings })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: await te(error.issues[0].message) }, { status: 400 })
    }
    console.error(error)
    return NextResponse.json({ error: await te('설정 저장 중 오류가 발생했습니다.') }, { status: 500 })
  }
}
