import Link from 'next/link'
import { Compass } from 'lucide-react'
import { getT } from '@/i18n/server'

/** Branded 404 body (QA B-5): same card language as the rest of the app, one way back. */
export async function NotFoundCard() {
  const t = await getT()
  return (
    <section className="card p-8 text-center flex flex-col items-center gap-3" aria-labelledby="nf-title">
      <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-n-f3f3f3 text-n-666" aria-hidden>
        <Compass className="w-6 h-6" />
      </span>
      <p className="text-[12px] font-semibold tracking-wide text-n-888">404</p>
      <h1 id="nf-title" className="text-[20px] font-bold text-n-111">{t('찾는 페이지가 없어요')}</h1>
      <p className="text-[14px] text-n-666 max-w-[420px]">
        {t('주소가 바뀌었거나, 삭제됐거나, 볼 수 있는 권한이 없는 페이지예요.')}
      </p>
      <Link href="/feed" className="btn btn-primary min-h-[44px] rounded-full px-5 mt-2">{t('피드로 돌아가기')}</Link>
    </section>
  )
}
