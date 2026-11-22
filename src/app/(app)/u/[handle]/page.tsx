import { notFound, redirect } from 'next/navigation'
import { getMemberIdByHandle } from '@/lib/data/members'

/** @handle → profile. Mentions link here; names never resolve to people. */
export default async function HandlePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const id = await getMemberIdByHandle(decodeURIComponent(handle).toLowerCase()).catch(() => null)
  if (!id) notFound()
  redirect(`/members/${id}`)
}
