import { redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { ProfileForm } from '@/components/profile/profile-form'
import { toProfileFormMember } from '@/lib/profile-form-member'
import { getT } from '@/i18n/server'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('프로필 만들기 · AI쓰발') }
}

/**
 * Required once after signup: a self-made nickname, unique @handle and avatar.
 * Google name/photo are only a private prefill; the real name stays hidden unless opted in.
 * ?preview=1 (DEV only) renders it for an already-complete profile so it can be reviewed.
 */
export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const st = await getT()
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/')
  if (state.type === 'waitlist') redirect('/waitlist')
  const preview = (await searchParams).preview === '1' && process.env.DEV_BYPASS_AUTH === 'true'
  if (state.member.profile_completed_at && !preview) redirect('/feed')
  const t = await getT()
  const me = toProfileFormMember(preview ? { ...state.member, handle: null, avatar_url: null, display_name: st('새 멤버'), profile_completed_at: null } : state.member)

  return (
    <main className="min-h-dvh px-4 py-8" style={{ background: 'var(--n-f4f2ee)' }}>
      <div className="mx-auto w-full max-w-[520px] space-y-4">
        <header className="space-y-1">
          <p className="text-[13px] font-semibold" style={{ color: 'var(--c-5b3fc4)' }}>
            {t('AI쓰발에 오신 걸 환영해요 👋')}
          </p>
          <h1 className="text-[24px] font-bold leading-tight" style={{ color: 'var(--n-111)' }}>
            {t('커뮤니티에서 쓸 프로필을 만들어요')}
          </h1>
          <p className="text-[13.5px]" style={{ color: 'var(--n-555)' }}>
            {t('여기서 만든 닉네임·@핸들·아바타가 피드, 아고라, 모임, 네트워크 어디서나 내 이름이 돼요. 구글 이름과 이메일은 공개되지 않아요.')}
          </p>
        </header>
        <ProfileForm me={me} mode="onboarding" />
      </div>
    </main>
  )
}
