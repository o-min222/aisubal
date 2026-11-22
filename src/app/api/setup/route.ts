import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { isDevMode } from '@/lib/auth'

/**
 * Bootstrap founder/admin member.
 * Requires AISUBAL_SETUP_KEY query param.
 *
 * In DEV_BYPASS_AUTH mode returns the local seed founder info.
 * In production, creates an admin member with signup_completed_at set
 * so the INSERT trigger issues 2 active invite codes.
 */
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const key = searchParams.get('key')

  if (!key || key !== process.env.AISUBAL_SETUP_KEY) {
    return NextResponse.json({ error: 'Invalid setup key' }, { status: 403 })
  }

  if (isDevMode()) {
    return NextResponse.json({
      mode: 'dev',
      admin: {
        email: 'dev@aisubal.local',
        displayName: '개발자',
        note: 'DEV_BYPASS_AUTH is on — no Supabase write performed.',
      },
      inviteCodes: ['AXK8M2PQ', 'B7NJ4TRW'],
    })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const email = body.email || 'founder@aisubal.local'
    const displayName = body.displayName || '창립자'
    const authId = body.authId

    if (!authId) {
      return NextResponse.json(
        {
          error:
            'Provide authId from Supabase Auth (create the Google user first, then pass its UUID).',
        },
        { status: 400 }
      )
    }

    const service = createServiceClient()
    const { data: member, error } = await service
      .from('members')
      .insert({
        auth_id: authId,
        email,
        display_name: displayName,
        is_admin: true,
        signup_completed_at: new Date().toISOString(),
      })
      .select('*, invite_codes:invite_codes!invite_codes_created_by_id_fkey(code)')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      admin: {
        id: member.id,
        email: member.email,
        displayName: member.display_name,
      },
      inviteCodes: (member.invite_codes || []).map((c: { code: string }) => c.code),
    })
  } catch (error) {
    console.error('Setup error:', error)
    return NextResponse.json({ error: 'Setup failed' }, { status: 500 })
  }
}
