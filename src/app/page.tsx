import { redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { LandingLayout } from '@/components/landing/landing-layout'
import { getLandingPeek } from '@/lib/data/landing-peek'
import { LoginScreen } from './login/login-content'

export default async function HomePage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const state = await getUserState()
  // dev only: DEV_BYPASS_AUTH signs everyone in, so ?preview=1 shows the signed-out landing
  const devPreview = process.env.NODE_ENV !== 'production' && (await searchParams).preview === '1'
  if (state.type === 'member' && !devPreview) redirect('/feed')
  if (state.type === 'waitlist') redirect('/waitlist')

  const peek = await getLandingPeek().catch(() => [])
  return <LandingLayout peek={peek} login={<LoginScreen />} />
}
