'use client'

import { useState } from 'react'
import { Loader2, ScrollText, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { AGENT_SAFETY_CLAUSE, AGENT_SAFETY_CLAUSE_EN, AGENT_VALUES, AGENT_VALUES_EN, SLOGAN, agentSigner, pledgeTextFor, signatureMatches } from '@/lib/pledge'
import { PledgeDocument } from './pledge-document'
import { PledgeOriginal } from './pledge-form'
import { PledgeSealSequence, type RecordView } from './pledge-record'
import { T } from '@/i18n/t'
import { tn, tx, useLocale } from '@/i18n/client'

/**
 * The owner signs the 입단 서약 on the agent's behalf: 서약자 '{owner}님의 {agent}',
 * 보증인 = owner. Used in the connect wizard and for existing unsigned tokens.
 */
export function AgentPledgeCard({ tokenId, ownerName, agentName, onSigned, compact = false }: { tokenId: string; ownerName: string; agentName: string; onSigned: (at: string) => void; compact?: boolean }) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [sealing, setSealing] = useState(false)
  const [record, setRecord] = useState<RecordView | null>(null)
  const locale = useLocale()
  const doc = pledgeTextFor(locale)
  const [full, setFull] = useState(!compact)
  const ok = signatureMatches(typed, ownerName)

  async function sign() {
    if (!ok || busy) return
    setBusy(true)
    setSealing(true)
    try {
      const res = await fetch(`/api/tokens/${encodeURIComponent(tokenId)}/pledge`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ signature: typed }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.signedAt) throw new Error(d.error || tn('서약을 저장하지 못했어요.'))
      setRecord({ kind: 'agent', no: d.no ?? null, hash: d.hash ?? null, prevHash: d.prevHash ?? null, prevNo: d.prevNo ?? null, signedAt: String(d.signedAt), signer: d.signer || agentSigner(ownerName, agentName), inviter: d.inviter ?? ownerName })
    } catch (e) {
      setSealing(false)
      toast.error(e instanceof Error ? e.message : tn('서약을 저장하지 못했어요.'))
      setBusy(false)
    }
  }

  return (
    <div className="agent-pledge space-y-3">
      <div className="agent-pledge-head">
        <p className="slogan-en" style={{ color: 'var(--n-111)', fontSize: 17 }}>
          {SLOGAN.en}
        </p>
        <p className="text-[13px] leading-relaxed text-n-666 mt-1.5" style={{ wordBreak: 'keep-all' }}>
          {locale === 'ko' ? SLOGAN.ko : SLOGAN.koTranslated}
        </p>
      </div>
      <ul className="agent-values">
        {(locale === 'ko' ? AGENT_VALUES : AGENT_VALUES_EN).map((v) => (
          <li key={v.title}>
            <b>{v.title}</b>
            <span>{v.body}</span>
          </li>
        ))}
      </ul>
      <p className="agent-safety">
        <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>{locale === 'ko' ? AGENT_SAFETY_CLAUSE : AGENT_SAFETY_CLAUSE_EN}</span>
      </p>
      {full ? (
        <PledgeDocument
          t={doc}
          inviter={tx('{ownerName} (보증인)', { ownerName })}
          signature={<span className="pledge-signed-name" style={{ fontSize: 17 }}>{agentSigner(ownerName, agentName)}</span>}
        />
      ) : (
        <button type="button" onClick={() => setFull(true)} className="text-[13px] text-c-06c inline-flex items-center gap-1 min-h-[36px]">
          <ScrollText className="w-4 h-4" /> <T>서약 원문 보기</T>
        </button>
      )}
      {full && locale !== 'ko' && <PledgeOriginal />}
      <form
        className="agent-pledge-sign"
        onSubmit={(e) => {
          e.preventDefault()
          sign()
        }}
      >
        <label className="block text-[12.5px] font-medium text-n-666 mb-1" htmlFor={`guarantor-${tokenId}`}><T s="보증인 서명 · 내 닉네임 ‘{ownerName}’을 적어 주세요" vars={{ ownerName }} /></label>
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
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} {record ? tx('서약 완료') : tx('에이전트 대신 서약하기')}
        </button>
      </form>
      {sealing && (
        <PledgeSealSequence
          lines={[doc.title.replace(/^\[(.*)\]$/, '$1'), ...doc.preamble, ...doc.vows]}
          signer={agentSigner(ownerName, agentName)}
          record={record}
          onDone={() => {
            setSealing(false)
            if (record) onSigned(record.signedAt)
          }}
        />
      )}
    </div>
  )
}
