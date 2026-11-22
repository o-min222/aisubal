import { redirect } from 'next/navigation'
import { networkHref } from '@/lib/dashboard-tabs'
import { getT } from '@/i18n/server'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('네트워크 · AI쓰발') }
}

/** 네트워크 moved into 내 대시보드 → 네트워크 tab; keep old links (/network?root=…) working. */
export default async function NetworkRedirect({ searchParams }: { searchParams: Promise<{ root?: string }> }) {
  const root = (await searchParams).root || null
  redirect(networkHref({ root }))
}
