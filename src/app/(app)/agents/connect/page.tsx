import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { ConnectWizard } from '@/components/connect/connect-wizard'
import { initialReview } from '@/lib/agent-connect'
import { getT } from '@/i18n/server'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('에이전트 연결 · AI쓰발') }
}

type From = 'signup' | 'settings' | 'agora' | 'other'

export default async function ConnectPage({ searchParams }: { searchParams: Promise<{ from?: string; preset?: string }> }) {
  const state = await getUserState()
  if (state.type !== 'member') redirect('/login')
  const sp = await searchParams
  const raw = sp.from
  const from: From = raw === 'signup' || raw === 'settings' || raw === 'agora' ? raw : 'other'
  const h = await headers()
  const host = h.get('x-forwarded-host') || h.get('host') || 'aisubal.vercel.app'
  const proto = h.get('x-forwarded-proto') || (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https')
  const origin = `${proto}://${host}`
  return <ConnectWizard origin={origin} mcpUrl={`${origin}/api/mcp`} isAdmin={Boolean(state.member.is_admin)} from={from} ownerName={state.member.display_name} initialReview={initialReview(sp.preset, Boolean(state.member.is_admin))} />
}
