import { notFound } from 'next/navigation'
import { getT } from '@/i18n/server'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('페이지를 찾을 수 없어요 · AI쓰발') }
}

/** Unknown URLs render the 404 inside the app shell (specific routes always win over this catch-all). */
export default function Missing() {
  notFound()
}
