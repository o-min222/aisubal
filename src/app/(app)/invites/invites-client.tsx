'use client'

import { useEffect, useState } from 'react'
import { Users, Copy, Check, AlertCircle, User, Share2, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import type { InviteCodeRow } from '@/lib/data/invites'
import { RelativeTime } from '@/components/relative-time'
import { inviteShareText, inviteUrl } from '@/lib/invite-share'

/** Real invite codes (no mock data) with a KakaoTalk-ready copy and the Web Share sheet. */
export function InvitesClient({ inviterName, codes, codesActive, loadFailed }: { inviterName: string; codes: InviteCodeRow[]; codesActive: boolean; loadFailed: boolean }) {
  const [copied, setCopied] = useState<string | null>(null)
  const [canShare, setCanShare] = useState(false)
  const [origin, setOrigin] = useState('https://aisubal.vercel.app')
  const [open, setOpen] = useState<string | null>(null)

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
      toast.success(label)
      setTimeout(() => setCopied((k) => (k === key ? null : k)), 2000)
    } catch {
      toast.error('복사하지 못했어요. 길게 눌러 직접 복사해 주세요.')
      setOpen(key.replace(/^(msg|code):/, ''))
    }
  }

  async function share(code: string) {
    try {
      await navigator.share({ title: 'AI쓰발 초대장', text: inviteShareText(inviterName, code, origin) })
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') toast.error('공유하지 못했어요. 복사해서 보내 주세요.')
    }
  }

  const available = codes.filter((c) => !c.isUsed).length

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: '#111' }}>
          <Users className="w-6 h-6" /> 초대하기
        </h1>
        <p className="text-sm text-[#666] mt-1">
          링크를 카카오톡으로 보내면 받은 분이 Google로 로그인하는 것만으로 가입돼요. 남은 초대 <b className="text-[#111]">{available}</b>장
        </p>
      </div>

      {!codesActive && (
        <div className="card p-4 border-l-4 border-l-amber-400 bg-amber-50/50 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-amber-800">초대 코드가 아직 활성화되지 않았어요</p>
            <p className="text-sm text-amber-700 mt-1">가입을 완료하면 내 초대 코드가 활성화돼요.</p>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="p-4 border-b border-[#e5e5e5]">
          <h2 className="font-semibold" style={{ color: '#111' }}>
            내 초대 코드
          </h2>
          <p className="text-xs text-[#888] mt-0.5">각 코드는 1회만 쓸 수 있어요</p>
        </div>
        {loadFailed && <p className="p-6 text-center text-sm text-[#888]">초대 코드를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p>}
        {!loadFailed && codes.length === 0 && <p className="p-6 text-center text-sm text-[#888]">아직 받은 초대 코드가 없어요.</p>}
        <ul className="divide-y divide-[#eee]">
          {codes.map((c) => {
            const usable = !c.isUsed && codesActive
            const msg = inviteShareText(inviterName, c.code, origin)
            return (
              <li key={c.code} className="p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`font-mono text-lg tracking-wider ${usable ? 'text-[#111]' : 'text-[#aaa]'}`}>{c.code}</span>
                    {c.isUsed ? (
                      <span className="badge bg-green-100 text-green-700">사용됨</span>
                    ) : !codesActive ? (
                      <span className="badge bg-gray-100 text-gray-500">비활성</span>
                    ) : (
                      <span className="badge bg-blue-100 text-blue-700">사용 가능</span>
                    )}
                  </div>
                  {usable && (
                    <div className="flex gap-2 ml-auto">
                      <button type="button" onClick={() => copy(msg, `msg:${c.code}`, '카카오톡에 붙여넣을 초대 메시지를 복사했어요')} className="btn btn-primary btn-sm min-h-[40px] rounded-full">
                        {copied === `msg:${c.code}` ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} 복사
                      </button>
                      {canShare && (
                        <button type="button" onClick={() => share(c.code)} className="btn btn-secondary btn-sm min-h-[40px] rounded-full" aria-label="공유하기">
                          <Share2 className="w-4 h-4" /> 공유
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {usable && (
                  <div className="mt-2">
                    <button type="button" className="text-xs text-[#666] inline-flex items-center gap-1 min-h-[32px]" aria-expanded={open === c.code} onClick={() => setOpen(open === c.code ? null : c.code)}>
                      보낼 메시지 보기 <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open === c.code ? 'rotate-180' : ''}`} />
                    </button>
                    {open === c.code && (
                      <div className="mt-1 rounded-xl bg-[#f6f6f6] p-3 text-[13px] text-[#333] whitespace-pre-wrap break-all select-all">
                        {msg}
                        <div className="mt-2 flex gap-3 text-xs">
                          <button type="button" className="text-[#0066cc]" onClick={() => copy(inviteUrl(c.code, origin), `link:${c.code}`, '초대 링크만 복사했어요')}>
                            링크만 복사
                          </button>
                          <button type="button" className="text-[#0066cc]" onClick={() => copy(c.code, `code:${c.code}`, '초대 코드만 복사했어요')}>
                            코드만 복사
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {c.isUsed && (
                  <div className="flex items-center gap-2 mt-2 text-sm text-[#666]">
                    <User className="w-4 h-4" />
                    <span>{c.usedBy?.displayName ?? '가입 완료'}</span>
                    {c.usedAt && (
                      <>
                        <span>·</span>
                        <span>
                          <RelativeTime date={c.usedAt} /> 사용
                        </span>
                      </>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </div>

      <div className="card p-4 space-y-2 text-sm text-[#555]">
        <h2 className="font-semibold mb-1" style={{ color: '#111' }}>
          초대는 이렇게 동작해요
        </h2>
        <p>1. ‘복사’를 눌러 카카오톡에 붙여넣으면 링크 미리보기 카드와 함께 전송돼요.</p>
        <p>2. 받은 분이 링크를 열면 누가 초대했는지와 코드 상태를 보고 Google로 로그인해요.</p>
        <p>3. 로그인 후 가입 화면에 코드가 자동으로 들어가 있어요. 버튼 한 번이면 가입 완료.</p>
        <p>4. 이미 쓰인 코드면 받은 분은 웨이트리스트로 가요. 각 코드는 1회용이에요.</p>
      </div>
    </div>
  )
}
