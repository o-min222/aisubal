'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Link2, ShieldCheck } from 'lucide-react'
import { pledgeCanonicalText, pledgeDigest, recordNo, shortHash, type PledgeKind } from '@/lib/pledge-record'
import { useLocale, tx } from '@/i18n/client'
import { LOCALE_META } from '@/i18n/config'

export type RecordView = {
  kind: PledgeKind
  no: number | null
  hash: string | null
  prevHash: string | null
  prevNo: number | null
  signedAt: string
  signer: string
  inviter: string | null
}

function useKstStamp(iso: string) {
  const locale = useLocale()
  return useMemo(() => {
    const f = new Intl.DateTimeFormat(LOCALE_META[locale].intl, { dateStyle: 'medium', timeStyle: 'medium', hourCycle: 'h23', timeZone: 'Asia/Seoul' })
    return `${f.format(new Date(iso))} KST`
  }, [iso, locale])
}

/** The ledger block: previous block (inviter / owner) ─ thin link ─ this record. */
export function PledgeBlock({ r, sealed = true, animate = false }: { r: RecordView; sealed?: boolean; animate?: boolean }) {
  const stamp = useKstStamp(r.signedAt)
  const title = r.kind === 'agent' ? tx('에이전트 입단 기록 {no}', { no: recordNo(r.no) }) : tx('입단 기록 {no}', { no: recordNo(r.no) })
  const prevLabel = r.prevHash
    ? r.kind === 'agent'
      ? tx('이전 블록 · 보증인 {name}', { name: r.inviter ?? '' })
      : tx('이전 블록 · 초대인 {name}', { name: r.inviter ?? '' })
    : r.kind === 'agent'
      ? tx('보증인 {name} · 아직 서약 기록 없음', { name: r.inviter ?? '' })
      : r.inviter
        ? tx('초대인 {name} · 아직 서약 기록 없음', { name: r.inviter })
        : tx('창립 블록 · 초대인 없음')
  return (
    <div className={`pr-chain ${animate ? 'is-animated' : ''}`}>
      <div className="pr-prev">
        <Link2 className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
        <span className="min-w-0" style={{ wordBreak: 'keep-all' }}>{prevLabel}</span>
        {r.prevHash ? (
          <code className="pr-mono ml-auto flex-shrink-0">
            {r.prevNo ? `${recordNo(r.prevNo)} · ` : ''}
            {shortHash(r.prevHash, 6, 4)}
          </code>
        ) : (
          <code className="pr-mono ml-auto flex-shrink-0">genesis</code>
        )}
      </div>
      <div className="pr-link" aria-hidden />
      <div className={`pr-block ${sealed ? 'is-sealed' : ''}`}>
        <div className="pr-block-head">
          <span className="pr-block-title">{title}</span>
          {sealed && (
            <span className="pr-sealed">
              <Check className="w-3.5 h-3.5" aria-hidden />
              {tx('영구 기록됨')}
            </span>
          )}
        </div>
        <dl className="pr-fields">
          <div>
            <dt>SHA-256</dt>
            <dd className="pr-mono pr-hash">{r.hash ?? '—'}</dd>
          </div>
          <div>
            <dt>{tx('서약자')}</dt>
            <dd>{r.signer}</dd>
          </div>
          <div>
            <dt>{tx('서명 시각')}</dt>
            <dd className="tabular-nums">{stamp}</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}

/** Recompute the digest in this browser from the record's fields. */
export function PledgeVerify({ r }: { r: RecordView }) {
  const [state, setState] = useState<'idle' | 'ok' | 'bad'>('idle')
  if (!r.hash) return null
  return (
    <div className="pr-verify">
      <button
        type="button"
        className="pr-verify-btn"
        onClick={async () => {
          const h = await pledgeDigest({ kind: r.kind, signer: r.signer, inviter: r.inviter, prevHash: r.prevHash, signedAt: r.signedAt })
          setState(h === r.hash ? 'ok' : 'bad')
        }}
      >
        <ShieldCheck className="w-4 h-4" aria-hidden /> {tx('이 브라우저에서 해시 검증')}
      </button>
      {state === 'ok' && <p className="pr-verify-ok">{tx('해시가 일치해요. 이 기록은 서명한 내용 그대로예요.')}</p>}
      {state === 'bad' && <p className="pr-verify-bad">{tx('해시가 일치하지 않아요.')}</p>}
    </div>
  )
}

/** UTF-8 bytes of the canonical text as hex rows (what actually gets hashed). */
function hexRows(text: string, width: number): string[] {
  const bytes = new TextEncoder().encode(text)
  const rows: string[] = []
  let row = ''
  for (const b of bytes) {
    row += b.toString(16).padStart(2, '0')
    if (row.length >= width) {
      rows.push(row)
      row = ''
    }
  }
  if (row) rows.push(row)
  return rows
}

const HEX = '0123456789abcdef'
type Phase = 0 | 1 | 2 | 3 | 4 // sign → scan → digest → block → sealed

/**
 * Full-screen sealing sequence (~3s): signature types in → pledge text turns
 * into its UTF-8 hex, scanned top to bottom → collapses into the SHA-256 line →
 * becomes a ledger block linked to the inviter's → '영구 기록됨'.
 * Starts on submit; the digest phase waits for the real record from the server.
 * Tap skips to the end; reduced motion shows the final state only.
 */
export function PledgeSealSequence({ lines, record, signer, onDone, autoContinueMs = 1800 }: { lines: readonly string[]; record: RecordView | null; signer: string; onDone: () => void; autoContinueMs?: number }) {
  const [reduce] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [narrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 480)
  const [phase, setPhase] = useState<Phase>(0)
  const [typed, setTyped] = useState(0)
  const [digest, setDigest] = useState('')
  const doneRef = useRef(onDone)
  useEffect(() => {
    doneRef.current = onDone
  }, [onDone])
  const finished = useRef(false)
  const finish = () => {
    if (finished.current) return
    finished.current = true
    doneRef.current()
  }

  const rows = useMemo(() => hexRows(record ? pledgeCanonicalText(record.signedAt) : lines.join('\n'), narrow ? 40 : 56).slice(0, 18), [record, lines, narrow])
  const shown = reduce && record ? 4 : phase

  // 0: type the signature line
  useEffect(() => {
    if (reduce || phase !== 0) return
    const step = Math.max(35, Math.floor(650 / Math.max(1, signer.length)))
    const id = window.setInterval(() => setTyped((n) => (n >= signer.length ? n : n + 1)), step)
    const t = window.setTimeout(() => setPhase(1), 750)
    return () => {
      window.clearInterval(id)
      window.clearTimeout(t)
    }
  }, [phase, signer, reduce])

  // 1: scan; move on once the server returned the record
  useEffect(() => {
    if (reduce || phase !== 1 || !record) return
    const t = window.setTimeout(() => setPhase(2), 1000)
    return () => window.clearTimeout(t)
  }, [phase, record, reduce])

  // 2: digest resolves left to right from noise into the real hash
  useEffect(() => {
    if (reduce || phase !== 2 || !record?.hash) return
    const target = record.hash
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / 550)
      const fixed = Math.floor(k * target.length)
      let s = target.slice(0, fixed)
      for (let i = fixed; i < target.length; i++) s += HEX[(Math.random() * 16) | 0]
      setDigest(s)
      if (k < 1) raf = requestAnimationFrame(tick)
      else window.setTimeout(() => setPhase(3), 200)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [phase, record, reduce])

  // 3 → 4
  useEffect(() => {
    if (reduce || phase !== 3) return
    const t = window.setTimeout(() => setPhase(4), 700)
    return () => window.clearTimeout(t)
  }, [phase, reduce])

  // 4: hold the calm final state, then continue
  useEffect(() => {
    if (shown !== 4 || autoContinueMs <= 0) return
    const t = window.setTimeout(finish, autoContinueMs)
    return () => window.clearTimeout(t)
  }, [shown, autoContinueMs])

  const skip = () => {
    if (!record) return // nothing to show yet: keep the honest wait
    if (shown < 4) setPhase(4)
    else finish()
  }

  return (
    <div className={`ps-overlay ps-phase-${shown}`} role="dialog" aria-modal="true" aria-label={tx('입단 기록')} onClick={skip}>
      <div className="ps-stage">
        <p className="ps-status" aria-live="polite">
          {shown <= 1 ? tx('서약문을 기록하는 중…') : shown === 2 ? tx('SHA-256으로 봉인하는 중…') : shown === 3 ? (record?.kind === 'agent' ? tx('보증인의 기록에 잇는 중…') : tx('초대인의 기록에 잇는 중…')) : tx('영구 기록됨')}
        </p>

        {shown <= 2 && (
          <div className="ps-sheet">
            <div className="ps-text" aria-hidden>
              {lines.slice(0, 7).map((l, i) => (
                <p key={i}>{l}</p>
              ))}
            </div>
            <div className="ps-hex" aria-hidden>
              {rows.map((r, i) => (
                <p key={i}>{r}</p>
              ))}
            </div>
            <div className="ps-scanline" aria-hidden />
          </div>
        )}

        {shown <= 1 && (
          <p className="ps-sign">
            <span className="ps-sign-label">{tx('서약자')}</span>
            <span className="ps-sign-value">
              {signer.slice(0, reduce ? signer.length : typed)}
              <span className="ps-caret" aria-hidden />
            </span>
          </p>
        )}

        {shown === 2 && <p className="ps-digest pr-mono">{digest || '\u00a0'}</p>}

        {shown >= 3 && record && (
          <div className="ps-block-wrap">
            <PledgeBlock r={record} sealed={shown === 4} animate={shown === 3} />
          </div>
        )}

        <p className="ps-hint">{shown === 4 ? tx('탭하면 계속해요') : record ? tx('탭하면 건너뛰어요') : '\u00a0'}</p>
      </div>
    </div>
  )
}
