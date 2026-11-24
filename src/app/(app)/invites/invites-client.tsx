'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { networkHref } from '@/lib/dashboard-tabs'
import { Users, Copy, Check, AlertCircle, User, Share2, ChevronDown, Crown, QrCode } from 'lucide-react'
import { toast } from 'sonner'
import type { InviteCodeRow } from '@/lib/data/invites'
import type { BatchProgress } from '@/lib/invite-batch'
import { RelativeTime } from '@/components/relative-time'
import { inviteShareText, inviteUrl } from '@/lib/invite-share'
import { InviteQrOverlay } from '@/components/invites/invite-qr'
import { T } from '@/i18n/t'
import { msg as m } from '@/i18n/translate'
import { tx, tn, useLocale } from '@/i18n/client'

/** Real invite codes (no mock data): copy the invite message (send it anywhere) or the Web Share sheet. */
export function InvitesClient({ inviterId, inviterName, inviterAvatarUrl, codes, codesActive, loadFailed, allowance, progress }: { inviterId: string; inviterName: string; inviterAvatarUrl?: string | null; codes: InviteCodeRow[]; codesActive: boolean; loadFailed: boolean; allowance: number; progress: BatchProgress }) {
  const locale = useLocale()
  const [copied, setCopied] = useState<string | null>(null)
  const [canShare, setCanShare] = useState(false)
  const [origin, setOrigin] = useState('https://aisubal.vercel.app')
  const [open, setOpen] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null)

  useEffect(() => {
    // client-only capabilities (avoid hydration mismatch)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function')
    setOrigin(window.location.origin)
  }, [])

  async function copy(text: string, key: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      toast.success(tn(label))
      setTimeout(() => setCopied((k) => (k === key ? null : k)), 2000)
    } catch {
      toast.error(tn('복사하지 못했어요. 길게 눌러 직접 복사해 주세요.'))
      setOpen(key.replace(/^(link|url|code):/, ''))
    }
  }

  async function share(code: string) {
    try {
      await navigator.share({ title: tx('AI쓰발 초대장'), text: inviteShareText(inviterName, code, origin, tx, locale) })
      // (text already carries the link on its own line, so no separate url: avoids a doubled link)
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') toast.error(tn('공유하지 못했어요. 복사해서 보내 주세요.'))
    }
  }

  const availableCodes = codes.filter((c) => !c.isUsed)
  // who joined, most recent first (A33: folded away, closed by default)
  const usedCodes = codes.filter((c) => c.isUsed).sort((x, y) => Date.parse(y.usedAt ?? '') - Date.parse(x.usedAt ?? '') || 0)

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--n-111)' }}>
          <Users className="w-6 h-6" /> <T>초대하기</T>
        </h1>
        <p className="text-sm text-n-666 mt-1">
          <T>초대 메시지를 복사해 카톡·문자·DM 어디로든 조용히 전하세요.</T>{' '}
          <Link href={networkHref()} className="text-link whitespace-nowrap">
            <T>초대 네트워크 보기</T> ›
          </Link>
        </p>
      </div>

      {!codesActive && (
        <div className="card p-4 border-l-4 border-l-amber-400 bg-c-fff4e5/50 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-c-8a4b00"><T>초대 코드가 아직 활성화되지 않았어요</T></p>
            <p className="text-sm text-c-8a4b00 mt-1"><T>가입을 완료하면 내 초대 코드가 활성화돼요.</T></p>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="p-4 border-b border-n-e5e5e5">
          <h2 className="font-semibold" style={{ color: 'var(--n-111)' }}>
            <T s="초대 가능한 코드 {n}장" vars={{ n: availableCodes.length }} />
          </h2>
          {codesActive && !loadFailed && (
            <>
              <p className="text-sm text-n-555 mt-1" data-testid="invite-progress">
                <T s="초대한 {n}/{total}명 가입" vars={{ n: <b className="text-n-111 tabular-nums">{progress.joined}</b>, total: progress.size }} />
                {' · '}
                <T s="모두 가입하면 바로 {n}장이 다시 채워져요" vars={{ n: allowance }} />
              </p>
              <div className="invite-progress mt-2" role="progressbar" aria-valuemin={0} aria-valuemax={progress.size} aria-valuenow={progress.joined} aria-label={tx('초대 진행')}>
                <span style={{ width: `${progress.size ? Math.round((progress.joined / progress.size) * 100) : 0}%` }} />
              </div>
              {progress.completed > 0 && (
                <p className="text-xs text-n-888 mt-2 inline-flex items-center gap-1">
                  <Crown className="w-3.5 h-3.5" aria-hidden /> <T s="초대장 {n}번 다시 채움" vars={{ n: progress.completed }} />
                </p>
              )}
            </>
          )}
        </div>
        {loadFailed && <p className="p-6 text-center text-sm text-n-888"><T>초대 코드를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</T></p>}
        {!loadFailed && availableCodes.length === 0 && (
          <p className="p-6 text-center text-sm text-n-888">{codes.length ? <T>지금은 초대 가능한 코드가 없어요.</T> : <T>아직 받은 초대 코드가 없어요.</T>}</p>
        )}
        <ul className="divide-y divide-n-eee">
          {availableCodes.map((c) => {
            const usable = codesActive
            const msg = inviteShareText(inviterName, c.code, origin, tx, locale)
            return (
              <li key={c.code} className="p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`font-mono text-lg tracking-wider ${usable ? 'text-n-111' : 'text-n-aaa'}`}>{c.code}</span>
                    {!codesActive && <span className="badge bg-n-f3f3f3 text-n-666"><T>비활성</T></span>}
                  </div>
                  {usable && (
                    <div className="flex gap-2 ml-auto">
                      <button type="button" onClick={() => copy(msg, `link:${c.code}`, m('초대 메시지를 복사했어요. 원하는 곳에 붙여넣어 보내세요.'))} className="btn btn-primary btn-sm min-h-[40px] rounded-full">
                        {copied === `link:${c.code}` ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} <T>초대 메시지 복사</T>
                      </button>
                      <button type="button" onClick={() => setQr(c.code)} className="btn btn-secondary btn-sm min-h-[40px] rounded-full" aria-label={tx('QR로 보여주기')} data-invite-qr-open={c.code}>
                        <QrCode className="w-4 h-4" aria-hidden /> <T>QR</T>
                      </button>
                      {canShare && (
                        <button type="button" onClick={() => share(c.code)} className="btn btn-secondary btn-sm min-h-[40px] rounded-full">
                          <Share2 className="w-4 h-4" /> <T>공유하기</T>
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {usable && (
                  <div className="mt-2">
                    <button type="button" className="text-xs text-n-666 inline-flex items-center gap-1 min-h-[32px]" aria-expanded={open === c.code} onClick={() => setOpen(open === c.code ? null : c.code)}>
                      <T>보낼 메시지 보기</T> <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open === c.code ? 'rotate-180' : ''}`} />
                    </button>
                    {open === c.code && (
                      <div className="mt-1 rounded-xl bg-n-f6f6f6 p-3 text-[13px] text-n-333 whitespace-pre-wrap break-all select-all">
                        {msg}
                        <div className="mt-2 flex gap-3 text-xs">
                          <button type="button" className="text-link" onClick={() => copy(inviteUrl(c.code, origin, locale), `url:${c.code}`, m('초대 링크만 복사했어요'))}>
                            <T>링크만 복사</T>
                          </button>
                          <button type="button" className="text-link" onClick={() => copy(c.code, `code:${c.code}`, m('초대 코드만 복사했어요'))}>
                            <T>코드만 복사</T>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </div>

      {usedCodes.length > 0 && (
        <details className="card overflow-hidden invite-used" data-testid="invite-used">
          <summary className="p-4 flex items-center justify-between gap-3 cursor-pointer select-none">
            <span className="font-semibold" style={{ color: 'var(--n-111)' }}><T s="사용한 초대장 {n}장" vars={{ n: usedCodes.length }} /></span>
            <ChevronDown className="w-4 h-4 text-n-888 invite-used-chev" aria-hidden />
          </summary>
          <ul className="divide-y divide-n-eee border-t border-n-e5e5e5">
            {usedCodes.map((c) => (
              <li key={c.code} className="px-4 py-3 flex items-center gap-3 text-sm">
                <User className="w-4 h-4 text-n-888 flex-shrink-0" aria-hidden />
                <span className="text-n-111 truncate">{c.usedBy?.displayName ?? <T>가입 완료</T>}</span>
                <span className="ml-auto flex items-center gap-2 text-xs text-n-888 whitespace-nowrap">
                  <span className="font-mono">{c.code}</span>
                  {c.usedAt && <>· <RelativeTime date={c.usedAt} /></>}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {qr && (
        <InviteQrOverlay
          code={qr}
          origin={origin}
          inviterId={inviterId}
          inviterName={inviterName}
          inviterAvatarUrl={inviterAvatarUrl}
          remaining={availableCodes.length}
          onClose={() => setQr(null)}
        />
      )}

      <div className="card p-4 space-y-2 text-sm text-n-555">
        <h2 className="font-semibold mb-1" style={{ color: 'var(--n-111)' }}>
          <T>초대는 이렇게 동작해요</T>
        </h2>
        <p><T>1. ‘초대 메시지 복사’를 눌러 카카오톡·문자·메일·DM 등 원하는 곳에 붙여넣어 보내세요. 이름·코드·링크가 함께 담기고, 대부분의 메신저에서 미리보기 카드도 보여요. 앞에 있는 사람에게는 ‘QR’을 눌러 이 화면을 보여 주세요. 같은 링크로 가입이 시작돼요.</T></p>
        <p><T>2. 받은 분이 링크를 열면 누가 초대했는지와 코드 상태를 보고 Google로 로그인해요.</T></p>
        <p><T>3. 로그인 후 가입 화면에 코드가 자동으로 들어가 있어요. 버튼 한 번이면 가입 완료.</T></p>
        <p><T>4. 이미 쓰인 코드면 받은 분은 웨이트리스트로 가요. 각 코드는 1회용이에요.</T></p>
        <p><T s="5. 멤버마다 초대장이 {n}장 있어요. {n}명이 모두 가입하면 바로 새 초대장 {n}장이 채워지고 ‘초대왕’ 뱃지를 받아요. 쓰지 않은 코드는 그대로 남아요." vars={{ n: allowance }} /></p>
      </div>
    </div>
  )
}
