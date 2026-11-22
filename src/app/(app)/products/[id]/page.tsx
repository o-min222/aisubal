import { notFound, redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { toolSlugForProduct } from '@/lib/data/tools'

/** Old launch URLs → the launch's page in the unified 툴 section. */
export default async function ProductRedirect({ params }: { params: Promise<{ id: string }> }) {
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')
  const { id } = await params
  if (id === 'new') redirect('/tools/launch')
  const slug = await toolSlugForProduct(id).catch(() => null)
  if (!slug) notFound()
  redirect(`/tools/${slug}`)
}
