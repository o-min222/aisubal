import { notFound, redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { toolSlugForProduct } from '@/lib/data/tools'
import { getT } from '@/i18n/server'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('갤러리 · AI쓰발') }
}

/** Old launch URLs → the launch's page in the unified 툴 section. */
export default async function ProductRedirect({ params }: { params: Promise<{ id: string }> }) {
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/')
  if (state.type === 'waitlist') redirect('/waitlist')
  const { id } = await params
  if (id === 'new') redirect('/gallery/launch')
  const slug = await toolSlugForProduct(id).catch(() => null)
  if (!slug) notFound()
  redirect(`/gallery/${slug}`)
}
