import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import type { PledgeText } from '@/lib/pledge'
import { T } from '@/i18n/t'
import { msg } from '@/i18n/translate'

/** '첫째, …' / 'First, …' → the ordinal becomes the number in the gutter; the words stay as authored. */
function splitVow(v: string): [string | null, string] {
  const m = v.match(/^([^\s,，]{1,10}),\s*([\s\S]+)$/)
  return m ? [m[1], m[2]] : [null, v]
}

/** The authored pledge as a plain document: title, preamble, numbered vows, closing, signature block. */
export function PledgeDocument({ t, inviter, signature, foundingLabel = msg('창립 멤버'), seal, kicker }: { t: PledgeText; inviter: string | null; signature: ReactNode; foundingLabel?: string; seal?: ReactNode; kicker?: ReactNode }) {
  return (
    <article className="pledge-doc" aria-labelledby="pledge-title">
      {kicker ? <p className="pledge-kicker">{kicker}</p> : null}
      <h1 id="pledge-title" className="pledge-title">
        {t.title.replace(/^\[(.*)\]$/, '$1')}
      </h1>
      {t.preamble.map((p) => (
        <p key={p} className="pledge-p">
          {p}
        </p>
      ))}
      <ol className="pledge-vows">
        {t.vows.map((v, i) => {
          const [no, body] = splitVow(v)
          return (
            <li key={v}>
              <span className="pledge-vow-no">{no ?? String(i + 1).padStart(2, '0')}</span>
              <p className="pledge-vow-body">{body}</p>
            </li>
          )
        })}
      </ol>
      <p className="pledge-closing">{t.closing}</p>
      <p className="pledge-dateline">{t.dateline}</p>
      <div className="pledge-sign">
        <div>
          <span className="pledge-sign-label">{t.signerLabel}</span>
          <span className="pledge-sign-value">{signature}</span>
        </div>
        <div>
          <span className="pledge-sign-label">{t.inviterLabel}</span>
          <span className="pledge-sign-value pledge-inviter">{inviter ?? <T>{foundingLabel}</T>}</span>
        </div>
      </div>
      {seal ? <div className="pledge-seal-row">{seal}</div> : null}
    </article>
  )
}

/** Quiet 'signed' mark under the signature block. */
export function PledgeSeal({ animate = false, label = msg('입단') }: { animate?: boolean; label?: string }) {
  return (
    <span className={`pledge-seal ${animate ? 'pledge-seal-in' : ''}`}>
      <Check className="w-3.5 h-3.5" aria-hidden />
      <span><T>AI쓰발</T></span>
      <T>{label}</T>
    </span>
  )
}
