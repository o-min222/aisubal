'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Mail, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { AFTER_LOGIN_COOKIE } from '@/lib/handoff-rules'
import { LINK_RETURN_PATH, linkErrorMessage, toLoginEmails, type LoginIdentity } from '@/lib/login-identities'
import { tn, useT } from '@/i18n/client'

/** 로그인 이메일: the account's sign-in emails. Adding one links another Google account (e.g. a Workspace work email) to this same account. */
export function LoginEmails({ identities, accountEmail, mock }: { identities: LoginIdentity[]; accountEmail: string; mock: boolean }) {
  const t = useT()
  const router = useRouter()
  const params = useSearchParams()
  const [list, setList] = useState(identities)
  const [busy, setBusy] = useState<string | null>(null)
  const rows = toLoginEmails(list, accountEmail)

  // back from Google: ?linked=1 or ?link_error=<code>; say it once, then drop it from the URL
  useEffect(() => {
    const err = params.get('link_error')
    if (params.get('linked')) toast.success(tn('로그인 이메일을 추가했어요. 이제 그 계정으로도 로그인할 수 있어요.'))
    else if (err) toast.error(tn(linkErrorMessage(err)))
    else return
    router.replace(LINK_RETURN_PATH, { scroll: false })
  }, [params, router])

  async function add() {
    if (busy) return
    setBusy('add')
    if (mock) {
      setList((l) => [...l, { id: `mock-${l.length}`, provider: 'google', email: 'dev@company.example', createdAt: new Date().toISOString() }])
      setBusy(null)
      toast.success(tn('로그인 이메일을 추가했어요. 이제 그 계정으로도 로그인할 수 있어요.'))
      return
    }
    // /auth/callback sends us back here; account picker so the work account can be chosen
    document.cookie = `${AFTER_LOGIN_COOKIE}=${encodeURIComponent(`${LINK_RETURN_PATH}?linked=1`)}; path=/; max-age=600; samesite=lax; secure`
    const { error } = await createClient().auth.linkIdentity({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback`, queryParams: { prompt: 'select_account' } },
    })
    if (error) {
      setBusy(null)
      toast.error(tn(linkErrorMessage(error.code)))
    }
  }

  async function remove(id: string, email: string | null) {
    if (busy || !window.confirm(tn('{email}(으)로는 더 이상 로그인할 수 없어요. 뺄까요?', { email: email ?? '' }))) return
    setBusy(id)
    try {
      if (!mock) {
        const supabase = createClient()
        const { data, error: listErr } = await supabase.auth.getUserIdentities()
        const ident = data?.identities.find((i) => i.identity_id === id)
        if (listErr || !ident) throw new Error('not_found')
        const { error } = await supabase.auth.unlinkIdentity(ident)
        if (error) throw Object.assign(new Error(error.message), { code: error.code })
      }
      setList((l) => l.filter((i) => i.id !== id))
      toast.success(tn('로그인 이메일에서 뺐어요.'))
      router.refresh()
    } catch (e) {
      const code = (e as { code?: string }).code
      toast.error(code === 'single_identity_not_deletable' ? tn(linkErrorMessage(code)) : tn('빼지 못했어요. 다시 시도해 주세요.'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="p-4 flex items-start gap-3" id="login-emails">
      <Mail className="w-5 h-5 text-n-666 mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-n-333">{t('로그인 이메일')}</div>
        <ul className="mt-1 space-y-1" aria-label={t('로그인 이메일')}>
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-2 min-h-[32px]">
              <span className="text-sm text-n-666 truncate min-w-0">{r.email || t('(이메일 비공개)')}</span>
              <span className="login-email-chip">{r.provider === 'google' ? 'Google' : r.provider}</span>
              {r.primary && <span className="login-email-chip">{t('기본')}</span>}
              {r.removable && (
                <button
                  type="button"
                  onClick={() => remove(r.id, r.email)}
                  disabled={busy !== null}
                  className="icon-btn ml-auto inline-flex items-center justify-center w-8 h-8 rounded-full text-n-888 disabled:opacity-50"
                  aria-label={t('{email} 빼기', { email: r.email ?? '' })}
                  title={t('로그인 이메일에서 빼기')}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
        <button type="button" onClick={add} disabled={busy !== null} className="text-link inline-flex items-center gap-1 text-sm mt-2 min-h-[36px] disabled:opacity-50">
          <Plus className="w-4 h-4" /> {t('직장 이메일 추가')}
        </button>
        <p className="text-xs text-n-888 mt-1">
          {t('회사 메일이 Google Workspace라면 그 계정으로도 같은 계정에 로그인할 수 있어요. 본인만 볼 수 있고 피드·게시물에 노출되지 않아요.')}
        </p>
      </div>
    </div>
  )
}
