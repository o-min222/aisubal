import Link from 'next/link'
import { getT } from '@/i18n/server'
import { NotFoundCard } from '@/components/not-found-card'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('페이지를 찾을 수 없어요 · AI쓰발') }
}

/** Fallback 404 outside the app shell (signed-out paths). */
export default async function NotFound() {
  const t = await getT()
  return (
    <main className="min-h-[100dvh] flex flex-col items-center justify-center gap-6 px-4" style={{ background: 'var(--n-f5f5f5)' }}>
      <Link href="/" className="text-[22px] font-black tracking-tight text-n-111" aria-label={t('AI쓰발 홈')}>AI쓰발</Link>
      <div className="w-full max-w-[520px]"><NotFoundCard /></div>
    </main>
  )
}
