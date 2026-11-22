import type { ReactNode } from 'react'
import type { PledgeText } from '@/lib/pledge'

/** The authored pledge, typeset like a charter. `signature` fills the 서약자 line. */
export function PledgeDocument({ t, inviter, signature, foundingLabel = '창립 멤버', seal }: { t: PledgeText; inviter: string | null; signature: ReactNode; foundingLabel?: string; seal?: ReactNode }) {
  return (
    <article className="pledge-doc" aria-labelledby="pledge-title">
      <h1 id="pledge-title" className="pledge-title" style={{ color: '#111' }}>
        {t.title}
      </h1>
      <div className="pledge-rule" aria-hidden />
      {t.preamble.map((p) => (
        <p key={p} className="pledge-p">
          {p}
        </p>
      ))}
      <ul className="pledge-vows">
        {t.vows.map((v) => (
          <li key={v}>{v}</li>
        ))}
      </ul>
      <p className="pledge-p">{t.closing}</p>
      <p className="pledge-dateline">{t.dateline}</p>
      <div className="pledge-sign-row">
        <div className="pledge-sign-cell">
          <span className="pledge-sign-label">{t.signerLabel}</span>
          <span className="pledge-sign-value">{signature}</span>
        </div>
        <span className="pledge-sign-sep" aria-hidden>
          /
        </span>
        <div className="pledge-sign-cell">
          <span className="pledge-sign-label">{t.inviterLabel}</span>
          <span className="pledge-sign-value pledge-inviter">{inviter ?? foundingLabel}</span>
        </div>
      </div>
      {seal}
    </article>
  )
}

export function PledgeSeal({ animate = false }: { animate?: boolean }) {
  return (
    <div className={`pledge-seal ${animate ? 'pledge-seal-in' : ''}`} aria-hidden>
      <span>AI쓰발</span>
      <small>입단</small>
    </div>
  )
}
