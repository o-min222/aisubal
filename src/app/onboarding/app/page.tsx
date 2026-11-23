import { redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { AppSetup } from '@/components/app-setup/app-setup'
import { getT } from '@/i18n/server'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('홈 화면에 추가 · AI쓰발') }
}

/**
 * Signup step after the pledge (D1): set AI쓰발 up as a phone app. On a computer it shows a QR that
 * signs this member in on the phone and opens this same step there (?from=handoff).
 */
export default async function AppSetupStep({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')
  const from = (await searchParams).from
  const next = from === 'signup' ? '/agents/connect?from=signup' : '/feed'
  const t = await getT()
  return (
    <main className="min-h-dvh px-4 py-8" style={{ background: 'var(--n-f4f2ee)' }}>
      <div className="mx-auto w-full max-w-[520px] space-y-4">
        <header className="space-y-1">
          <p className="text-[13px] font-semibold" style={{ color: 'var(--c-5b3fc4)' }}>
            {from === 'handoff' ? t('폰에서 이어서 설정해요') : t('가입 완료 · 앱 설정')}
          </p>
          <h1 className="text-[24px] font-bold leading-tight" style={{ color: 'var(--n-111)' }}>
            {t('AI쓰발을 폰 앱으로 쓰세요')}
          </h1>
          <p className="text-[13.5px]" style={{ color: 'var(--n-555)', wordBreak: 'keep-all' }}>
            {t('앱 스토어 없이 홈 화면에 추가하면 앱처럼 열려요. 언제든 설정 › 모바일 앱에서 다시 할 수 있어요.')}
          </p>
        </header>
        <AppSetup next={next} mode="onboarding" />
      </div>
    </main>
  )
}
