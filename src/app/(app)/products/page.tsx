import { redirect } from 'next/navigation'
import { getT } from '@/i18n/server'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('갤러리 · AI쓰발') }
}

/** 프로덕트 merged into 툴 (0006). */
export default function ProductsRedirect() {
  redirect('/tools?category=launch')
}
