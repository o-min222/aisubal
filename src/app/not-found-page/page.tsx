import { notFound } from 'next/navigation'

export const metadata = { robots: { index: false } }

/** A149: the middleware rewrites signed-out requests for unknown paths here, so they get the 404 page and status. */
export default function SignedOutNotFound() {
  notFound()
}
