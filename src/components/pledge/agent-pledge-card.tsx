'use client'

import { useState } from 'react'
import { Loader2, ScrollText, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { AGENT_SAFETY_CLAUSE, AGENT_VALUES, PLEDGE_KO, SLOGAN, agentSigner, signatureMatches } from '@/lib/pledge'
import { PledgeDocument, PledgeSeal } from './pledge-document'
import { T } from '@/i18n/t'
import { tn, tx } from '@/i18n/client'

/**
 * The owner signs the 입단 서약 on the agent's behalf: 서약자 '{owner}님의 {agent}',
 * 보증인 = owner. Used in the connect wizard and for existing unsigned tokens.
 */
export function AgentPledgeCard({ tokenId, ownerName, agentName, onSigned, compact = false }: { tokenId: string; ownerName: string; agentName: string; onSigned: (at: string) => void; compact?: boolean }) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [sealed, setSealed] = useState(false)
  const [full, setFull] = useState(!compact)
  const ok = signatureMatches(typed, ownerName)

  async function sign() {
    if (!ok || busy) return
    setBusy(true)
    try {
      const res = await fetch(`/api/tokens/${encodeURIComponent(tokenId)}/pledge`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ signature: typed }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || '서약을 저장하지 못했어요.')
      setSealed(true)
      toast.success(tn('{signer}가 서약했어요', { signer: tn('{owner}님의 {agent}', { owner: ownerName, agent: agentName }) }))
      setTimeout(() => onSigned(String(d.signedAt)), 900)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tn('서약을 저장하지 못했어요.'))
      setBusy(false)
    }
  }

  return (
    <div className="agent-pledge space-y-3">
      <div className="agent-pledge-head">
        <p className="slogan-en" style={{ color: '#111', fontSize: 16 }}>
          {SLOGAN.en}
        </p>
        <p className="text-[12.5px] text-[#6b5f4b] mt-1" style={{ wordBreak: 'keep-all' }}>
          {SLOGAN.ko}
        </p>
      </div>
      <ul className="agent-values">
        {AGENT_VALUES.map((v) => (
          <li key={v.title}>
            <b>{v.title}</b>
            <span>{v.body}</span>
          </li>
        ))}
      </ul>
      <p className="agent-safety">
        <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>{AGENT_SAFETY_CLAUSE}</span>
      </p>
      {full ? (
        <PledgeDocument
          t={PLEDGE_KO}
          inviter={tx('{ownerName} (보증인)', { ownerName })}
          seal={sealed ? <PledgeSeal animate /> : null}
          signature={<span className="pledge-signed-name" style={{ fontSize: 17 }}>{agentSigner(ownerName, agentName)}</span>}
        />
      ) : (
        <button type="button" onClick={() => setFull(true)} className="text-[13px] text-[#0066cc] inline-flex items-center gap-1 min-h-[36px]">
          <ScrollText className="w-4 h-4" /> <T>서약 원문 보기</T>
        </button>
      )}
      <form
        className="agent-pledge-sign"
        onSubmit={(e) => {
          e.preventDefault()
          sign()
        }}
      >
        <label className="block text-[13px] text-[#6b5f4b] mb-1" htmlFor={`guarantor-${tokenId}`}><T s="보증인 서명 · 내 닉네임 ‘{ownerName}’을 적어 주세요" vars={{ ownerName }} /></label>
        <input
          id={`guarantor-${tokenId}`}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={ownerName}
          autoComplete="off"
          spellCheck={false}
          maxLength={80}
          disabled={busy}
          className={`pledge-signature ${ok ? 'is-ok' : ''}`}
        />
        <button type="submit" disabled={!ok || busy} className="pledge-cta mt-3">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} {sealed ? tx('서약 완료') : tx('에이전트 대신 서약하기')}
        </button>
      </form>
    </div>
  )
}
