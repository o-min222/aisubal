import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { getPledgeStatus } from '@/lib/data/pledge'
import { pledgeTextFor } from '@/lib/pledge'
import { PledgeForm, PledgeOriginal } from '@/components/pledge/pledge-form'
import { LOCALE_META } from '@/i18n/config'
import { getLocale, getT } from '@/i18n/server'
import { PledgeDocument, PledgeSeal } from '@/components/pledge/pledge-document'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('선언 및 입단 서약 · AI쓰발'), robots: { index: false } }
}

const fmt = (iso: string, intl: string) => new Intl.DateTimeFormat(intl, { dateStyle: 'long', timeZone: 'Asia/Seoul' }).format(new Date(iso))

/**
 * Mandatory last step of signup (after the self-made profile): sign the
 * '선언 및 입단 서약' with your own nickname. Signed members see their copy.
 */
export default async function PledgePage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')
  const m = state.member
  if (!m.profile_completed_at) redirect('/onboarding')
  const status = await getPledgeStatus(m)
  const fromSignup = (await searchParams).from === 'signup'
  const next = fromSignup ? '/connect?from=signup' : '/feed'
  const locale = await getLocale()
  const t = await getT()
  const doc = pledgeTextFor(locale)

  return (
    <main className="pledge-page min-h-dvh px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-[600px] space-y-5">
        {status.signedAt ? (
          <>
            <PledgeDocument t={doc} inviter={status.inviter} foundingLabel={t('창립 멤버')} signature={<span className="pledge-signed-name">{status.signer}</span>} seal={<PledgeSeal label={t('입단')} />} />
            {locale !== 'ko' && <PledgeOriginal />}
            <p className="text-center text-[13px] text-[#777]">{t('{date}에 서약했어요.', { date: fmt(status.signedAt, LOCALE_META[locale].intl) })}</p>
            <div className="flex justify-center">
              <Link href="/me" className="btn btn-secondary rounded-full min-h-[44px] px-5">
                {t('내 대시보드로')}
              </Link>
            </div>
          </>
        ) : (
          <>
            <header className="text-center space-y-1">
              <p className="text-[12.5px] font-semibold tracking-wide" style={{ color: '#8a6d3b' }}>
                {t('마지막 단계 · 입단 서약')}
              </p>
              <p className="text-[13.5px] text-[#666]">{t('아래 선언을 읽고 서명하면 가입이 끝나요.')}</p>
            </header>
            <PledgeForm signer={status.signer} inviter={status.inviter} next={next} />
          </>
        )}
      </div>
    </main>
  )
}
