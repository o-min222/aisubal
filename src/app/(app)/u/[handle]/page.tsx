import { notFound, redirect } from 'next/navigation'
import { resolveHandle } from '@/lib/data/members'

/** @handle → profile. Mentions link here; names never resolve to people. Old handles resolve during their hold (0032). */
export default async function HandlePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const id = await resolveHandle(decodeURIComponent(handle).toLowerCase()).catch(() => null)
  if (!id) notFound()
  redirect(`/members/${id}`)
}
