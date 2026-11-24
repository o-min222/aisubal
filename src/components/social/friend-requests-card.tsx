'use client'

import Link from 'next/link'
import { useSyncExternalStore } from 'react'
import { X } from 'lucide-react'
import { UserAvatar } from '@/components/user-avatar'
import { FriendRequestActions } from '@/components/social/friend-request-actions'
import { cardSlice, dismissKey, isDismissed, DISMISS_STORAGE_KEY, FRIEND_REQUESTS_HREF, type IncomingRequest } from '@/lib/friend-requests'
import { T } from '@/i18n/t'
import { tx } from '@/i18n/client'

const DISMISS_EVENT = 'aisubal:friend-requests-dismissed'
function subscribeDismissed(cb: () => void) {
  window.addEventListener('storage', cb)
  window.addEventListener(DISMISS_EVENT, cb)
  return () => {
    window.removeEventListener('storage', cb)
    window.removeEventListener(DISMISS_EVENT, cb)
  }
}
function readDismissed(): string | null {
  try {
    return localStorage.getItem(DISMISS_STORAGE_KEY)
  } catch {
    return null
  }
}

/**
 * A86 · '○○님이 친구 신청했어요 [수락] [거절]' at the top of the home feed. Up to 3 rows, then 'N개 더'.
 * Dismissable; a request that wasn't there when it was dismissed brings it back. Answered rows stay with
 * their outcome until the next visit so a tap never makes the list jump.
 */
export function FriendRequestsCard({ people, total }: { people: IncomingRequest[]; total: number }) {
  const ids = people.map((p) => p.id)
  // server render shows the card (no layout shift for the usual case); it hides after hydration only if dismissed
  const stored = useSyncExternalStore(subscribeDismissed, readDismissed, () => null)
  const hidden = isDismissed(ids, stored)

  if (people.length === 0 || hidden) return null
  const { shown, more } = cardSlice(people, total)

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_STORAGE_KEY, dismissKey(ids))
    } catch {}
    window.dispatchEvent(new Event(DISMISS_EVENT))
  }

  return (
    <section className="fr-card" aria-label={tx('받은 친구 신청')}>
      <div className="fr-card-head">
        <span className="fr-card-title">
          <T>받은 친구 신청</T> <span className="fr-count">{Math.max(total, people.length)}</span>
        </span>
        <button type="button" className="fr-dismiss" onClick={dismiss} aria-label={tx('친구 신청 카드 닫기')} title={tx('닫기')}>
          <X className="w-4 h-4" aria-hidden />
        </button>
      </div>
      <ul className="fr-list">
        {shown.map((p) => (
          <li key={p.id} className="fr-row">
            <Link href={`/members/${p.id}`} className="fr-who">
              <UserAvatar id={p.id} name={p.name} avatarUrl={p.avatarUrl} size="sm" />
              <span className="fr-text">
                <T s="{name}님이 친구 신청했어요" vars={{ name: <b>{p.name}</b> }} />
              </span>
            </Link>
            <FriendRequestActions memberId={p.id} name={p.name} />
          </li>
        ))}
      </ul>
      {more > 0 && (
        <Link href={FRIEND_REQUESTS_HREF} className="fr-more">
          <T s="{n}개 더" vars={{ n: more }} /> ›
        </Link>
      )}
    </section>
  )
}
