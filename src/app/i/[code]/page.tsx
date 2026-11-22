import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { CheckCircle2, AlertCircle } from 'lucide-react'
import { getUserState } from '@/lib/auth'
import { getInvitePreview } from '@/lib/data/invites'
import { INVITE_STATUS_TEXT, SITE_INTRO, normalizeInviteCode } from '@/lib/invite-share'
import { InviteLandingActions } from '@/components/invite/invite-landing-actions'

type Props = { params: Promise<{ code: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params
  const preview = await getInvitePreview(code)
  const who = preview.inviter?.displayName
  const title = preview.status === 'valid' && who ? `${who}님이 AI쓰발에 초대했어요` : 'AI쓰발 초대장'
  return {
    title,
    description: SITE_INTRO,
    robots: { index: false, follow: false },
    openGraph: { title, description: SITE_INTRO, siteName: 'AI쓰발', type: 'website', locale: 'ko_KR' },
    twitter: { card: 'summary_large_image', title, description: SITE_INTRO },
  }
}

/** Public invite landing: who invited you, whether the code still works, Google login. */
export default async function InviteLandingPage({ params }: Props) {
  const { code: raw } = await params
  const code = normalizeInviteCode(raw)
  const [preview, state] = await Promise.all([getInvitePreview(raw), getUserState().catch(() => ({ type: 'unauthenticated' as const }))])
  const inviter = preview.inviter
  const usable = preview.status === 'valid'
  const isMember = state.type === 'member'

  return (
    <div className="min-h-screen bg-[#f7f7f7] flex flex-col items-center justify-center p-6">
      <Link href="/" className="mb-8" aria-label="AI쓰발">
        <Image src="/images/logo-black.png" alt="AI쓰발" width={160} height={48} priority className="h-10 w-auto" />
      </Link>
      <main className="invite-landing w-full max-w-md bg-white border border-[#e5e5e5] rounded-2xl p-7 text-center">
        {inviter ? (
          inviter.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={inviter.avatarUrl} alt="" className="w-16 h-16 rounded-full mx-auto object-cover ring-4 ring-[#f3f3f3]" />
          ) : (
            <span className="w-16 h-16 rounded-full mx-auto bg-[#111] text-white text-2xl font-bold inline-flex items-center justify-center ring-4 ring-[#f3f3f3]" aria-hidden>
              {[...inviter.displayName][0]}
            </span>
          )
        ) : (
          <span className="w-16 h-16 rounded-full mx-auto bg-[#eee] inline-flex items-center justify-center text-2xl" aria-hidden>
            ✉️
          </span>
        )}
        <h1 className="mt-4 text-xl font-bold" style={{ color: '#111' }}>
          {inviter && preview.status !== 'invalid' ? `${inviter.displayName}님이 AI쓰발에 초대했어요` : 'AI쓰발 초대장'}
        </h1>
        <p className="mt-2 text-sm text-[#555] leading-relaxed">{SITE_INTRO}</p>

        <div
          className={`mt-5 rounded-xl px-3 py-2.5 text-sm flex items-start gap-2 text-left ${usable ? 'bg-[#eefbf3] text-[#17663a]' : 'bg-[#fff4e5] text-[#8a4b00]'}`}
          role="status"
        >
          {usable ? <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
          <span>
            {code && <b className="font-mono tracking-wider mr-1.5">{code}</b>}
            {INVITE_STATUS_TEXT[preview.status]}
          </span>
        </div>

        <div className="mt-6">
          {isMember ? (
            <div className="space-y-3">
              <p className="text-sm text-[#555]">이미 AI쓰발 멤버예요. 이 초대 링크는 새로 오는 분을 위한 거예요.</p>
              <Link href="/feed" className="btn btn-primary w-full justify-center min-h-[48px]">
                피드로 가기
              </Link>
            </div>
          ) : (
            <InviteLandingActions code={code} usable={usable} signedIn={state.type === 'waitlist'} />
          )}
        </div>
      </main>
      <p className="mt-6 text-xs text-[#999] text-center max-w-sm">
        초대받은 분만 가입할 수 있어요. 로그인에는 Google 계정만 쓰고, 이메일·실명은 다른 멤버에게 보이지 않아요.
      </p>
    </div>
  )
}
