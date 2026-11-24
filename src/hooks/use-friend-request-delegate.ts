'use client'

import { useEffect } from 'react'
import { toast } from 'sonner'
import { NOTIFY_READ_EVENT } from '@/lib/notifications'
import { tx, tn } from '@/i18n/client'

/**
 * A86: answers the inline 수락 / 거절 on friend-request notification rows. Those rows are rendered by a server
 * action from whatever page the bell is on, so they can't carry a client component (the page's client manifest
 * may not have it); they're plain markup and this one listener — mounted by the bell, which is on every page —
 * does the POST and flips the row to its pre-rendered outcome. No page change.
 */
export function useFriendRequestDelegate() {
  useEffect(() => {
    async function onClick(e: MouseEvent) {
      const btn = (e.target as Element | null)?.closest?.('[data-fr-act]') as HTMLButtonElement | null
      if (!btn) return
      const box = btn.closest('[data-fr-member]') as HTMLElement | null
      if (!box || box.dataset.frDone || box.dataset.frBusy) return
      e.preventDefault()
      e.stopPropagation()
      const action = btn.dataset.frAct === 'accept' ? 'accept' : 'decline'
      const memberId = box.dataset.frMember!
      const name = box.dataset.frName || ''
      box.dataset.frBusy = '1'
      box.querySelectorAll('button').forEach((b) => (b.disabled = true))
      try {
        const res = await fetch('/api/social/friend', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId, action }) })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || tn('처리하지 못했어요.'))
        box.dataset.frDone = action === 'accept' ? 'accepted' : 'declined'
        if (action === 'accept') toast.success(tx('{name}님과 친구가 됐어요', { name }))
        window.dispatchEvent(new Event(NOTIFY_READ_EVENT))
      } catch (err) {
        box.querySelectorAll('button').forEach((b) => (b.disabled = false))
        toast.error(err instanceof Error ? err.message : tn('처리하지 못했어요.'))
      } finally {
        delete box.dataset.frBusy
      }
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])
}
