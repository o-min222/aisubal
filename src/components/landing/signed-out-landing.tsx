import { getT } from '@/i18n/server'
import { getLandingPeek } from '@/lib/data/landing-peek'
import { INVITE_HOW, INVITE_STATUS_TEXT, type InvitePreview } from '@/lib/invite-share'
import { LandingLayout } from './landing-layout'
import { LoginScreen, type LoginInvite } from './login-panel'

/**
 * A65c: the ONE signed-out screen — / (and /login, protected pages, the PWA start_url, all redirected
 * there) and /i/{code} (same screen, kept at its own URL so invite link previews keep their card).
 * A failed sign-in shows the plain screen so the error is on the first screen.
 */
export async function SignedOutLanding({ error, invite }: { error?: boolean; invite?: { code: string | null; preview: InvitePreview } }) {
  const t = await getT()
  const peek = error ? [] : await getLandingPeek().catch(() => [])
  let loginInvite: LoginInvite | undefined
  let note: string | null = null
  if (invite) {
    const { preview, code } = invite
    const usable = preview.status === 'valid'
    const who = preview.inviter && preview.status !== 'invalid' ? preview.inviter : null
    const title = who ? t('{name}님이 당신을 지목했습니다', { name: who.displayName }) : t('AI쓰발 초대장')
    note = who ? title : null
    loginInvite = {
      code,
      usable,
      title,
      avatarUrl: who?.avatarUrl ?? null,
      initial: who ? [...who.displayName][0] ?? '' : '',
      status: t(INVITE_STATUS_TEXT[preview.status]),
      how: usable ? t(INVITE_HOW) : t('로그인하면 웨이트리스트에 등록돼요. 다른 초대 코드를 받으면 그때 입력할 수 있어요.'),
    }
  }
  return <LandingLayout peek={peek} note={note} invited={Boolean(invite)} login={<LoginScreen invite={loginInvite} />} />
}
