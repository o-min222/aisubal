import type { Metadata } from 'next'
import { HandoffLanding } from './handoff-landing'

export const metadata: Metadata = { title: 'AI쓰발', robots: { index: false, follow: false }, referrer: 'no-referrer' }

/** Phone side of the desktop QR (D1). The token is in the URL fragment, so this page only sees it client-side. */
export default function HandoffPage() {
  return <HandoffLanding />
}
