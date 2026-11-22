import { notFound, redirect } from 'next/navigation'
import { resolveHandle } from '@/lib/data/members'
import { getT } from '@/i18n/server'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('프로필 · AI쓰발') }
}

/** @handle → profile. Mentions link here; names never resolve to people. Old handles resolve during their hold (0032). */
export default async function HandlePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const id = await resolveHandle(decodeURIComponent(handle).toLowerCase()).catch(() => null)
  if (!id) notFound()
  redirect(`/members/${id}`)
}
