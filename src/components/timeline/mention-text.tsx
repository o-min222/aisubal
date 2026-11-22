import Link from 'next/link'
import { Fragment } from 'react'

const MENTION = /(^|[^A-Za-z0-9_@])@([a-z0-9_]{3,20})(?![A-Za-z0-9_])/g

/** Plain text with @handle mentions linked. Only handles resolve — never names. */
export function MentionText({ text }: { text: string }) {
  const parts: React.ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(MENTION)) {
    const start = (m.index ?? 0) + m[1].length
    parts.push(text.slice(last, start))
    parts.push(
      <Link key={start} href={`/u/${m[2]}`} className="mention text-c-06c hover:underline">
        @{m[2]}
      </Link>
    )
    last = start + 1 + m[2].length
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
