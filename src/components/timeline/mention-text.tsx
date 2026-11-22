import Link from 'next/link'
import { Fragment } from 'react'

/**
 * @name.ai → agent (0066, resolved by handle on /agents/@name), @handle → member.
 * Agents first: member handles can't contain '.', so '@x.ai' is never a member.
 */
const MENTION = /(^|[^A-Za-z0-9_@가-힣])@(?:([0-9a-z_가-힣]{1,20})\.ai(?![0-9A-Za-z_가-힣])|([a-z0-9_]{3,20})(?![A-Za-z0-9_]|\.[0-9a-z_가-힣]))/g

export const agentHandleHref = (handle: string) => `/agents/${encodeURIComponent(`@${handle}`)}`

/** Plain text with @handle / @name.ai mentions linked. Only handles resolve — never names. */
export function MentionText({ text }: { text: string }) {
  const parts: React.ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(MENTION)) {
    const start = (m.index ?? 0) + m[1].length
    parts.push(text.slice(last, start))
    const agent = m[2]
    const label = agent ? `@${agent}.ai` : `@${m[3]}`
    parts.push(
      <Link key={start} href={agent ? agentHandleHref(agent) : `/u/${m[3]}`} className={`mention text-c-06c hover:underline${agent ? ' mention-agent' : ''}`}>
        {label}
      </Link>
    )
    last = start + label.length
  }
  parts.push(text.slice(last))
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>{p}</Fragment>
      ))}
    </>
  )
}
