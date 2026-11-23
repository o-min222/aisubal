import { msg } from '@/i18n/translate'

/**
 * A22: extra sign-in emails on the SAME account. Supabase gives an account one email but many
 * identities, so a work Google (Workspace) account is linked as a second Google identity
 * (auth.linkIdentity). Signing in with it finds that identity and opens the same account; Google's
 * own sign-in proves the address. An unlinked account still lands on the invite-only waitlist.
 */
export type LoginIdentity = { id: string; provider: string; email: string | null; createdAt: string | null }
export type LoginEmailRow = LoginIdentity & { primary: boolean; removable: boolean }

/** Where linking returns to (through /auth/callback's after-login cookie). */
export const LINK_RETURN_PATH = '/settings/account'

/** The account's own email first; the rest by when they were added. Only extra emails can be removed, never the last one. */
export function toLoginEmails(identities: LoginIdentity[], accountEmail: string | null): LoginEmailRow[] {
  const norm = (e: string | null) => (e ?? '').trim().toLowerCase()
  const primaryIdx = Math.max(0, identities.findIndex((i) => norm(i.email) === norm(accountEmail)))
  return identities
    .map((i, idx) => ({ ...i, primary: idx === primaryIdx, removable: false }))
    .sort((a, b) => Number(b.primary) - Number(a.primary) || String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')))
    .map((r, _i, all) => ({ ...r, removable: !r.primary && all.length > 1 }))
}

/** Supabase Auth error codes from linking / unlinking, in words. */
export function linkErrorMessage(code: string | null | undefined): string {
  switch (code) {
    case 'manual_linking_disabled':
      return msg('지금은 로그인 이메일을 추가할 수 없어요. 관리자가 기능을 켜야 해요.')
    case 'identity_already_exists':
    case 'email_exists':
      return msg('이미 다른 AI쓰발 계정에서 쓰는 이메일이에요.')
    case 'single_identity_not_deletable':
      return msg('마지막 로그인 방법은 뺄 수 없어요.')
    case 'over_request_rate_limit':
      return msg('잠시 후에 다시 시도해 주세요.')
    default:
      return msg('로그인 이메일을 추가하지 못했어요. 다시 시도해 주세요.')
  }
}
