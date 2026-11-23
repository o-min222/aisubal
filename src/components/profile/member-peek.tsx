'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { AdaptiveSheet } from '@/components/adaptive-sheet'
import { useMediaQuery } from '@/hooks/use-media-query'
import type { MemberCardData } from '@/lib/data/member-card'
import { MemberCard } from './member-card'
import { T } from '@/i18n/t'
import { tx } from '@/i18n/client'

const cache = new Map<string, Promise<MemberCardData | null>>()
function loadCard(id: string) {
  let p = cache.get(id)
  if (!p) {
    p = fetch(`/api/members/${encodeURIComponent(id)}/card`, { cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<MemberCardData>) : null))
      .catch(() => null)
    cache.set(id, p)
    // keep it fresh-ish: drop after a minute so follow state etc. updates
    setTimeout(() => cache.delete(id), 60_000)
  }
  return p
}

function PeekBody({ state, memberId }: { state: MemberCardData | null | 'loading'; memberId: string }) {
  if (state === 'loading')
    return (
      <div className="p-6 text-center text-sm text-n-888" role="status">
        <T>불러오는 중…</T>
      </div>
    )
  if (!state)
    return (
      <div className="p-6 text-center text-sm text-n-888">
        <T>프로필을 불러오지 못했어요.</T> <Link href={`/members/${memberId}`} className="text-link"><T>프로필 열기</T></Link>
      </div>
    )
  return (
    <>
      <MemberCard data={state} variant="peek" />
      <Link href={state.isMe ? '/me' : `/members/${state.id}`} className="block text-center text-[13px] text-link py-2.5 border-t border-n-eee">
        <T>프로필 전체 보기</T>
      </Link>
    </>
  )
}

/**
 * Click a real-name member (avatar / name) to see their unified profile card.
 * Callers must never wrap 부캐 (nickname), agent or anonymous authors.
 */
export function MemberPeek({ memberId, label, children, className = '' }: { memberId: string; label: string; children: ReactNode; className?: string }) {
  const desktop = useMediaQuery('(min-width: 768px)')
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<MemberCardData | null | 'loading'>('loading')

  function change(next: boolean) {
    setOpen(next)
    if (next) {
      setState('loading')
      loadCard(memberId).then(setState)
    }
  }

  if (desktop) {
    return (
      <Popover open={open} onOpenChange={change}>
        <PopoverTrigger className={`member-peek-trigger ${className}`} aria-label={tx('{label} 프로필 카드', { label })}>
          {children}
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={6} className="member-peek-pop">
          <PeekBody state={state} memberId={memberId} />
        </PopoverContent>
      </Popover>
    )
  }
  return (
    <>
      <button type="button" className={`member-peek-trigger ${className}`} aria-label={tx('{label} 프로필 카드', { label })} onClick={() => change(true)}>
        {children}
      </button>
      <AdaptiveSheet open={open} onOpenChange={setOpen} title={tx('{label} 프로필', { label })} className="!p-0">
        <PeekBody state={state} memberId={memberId} />
      </AdaptiveSheet>
    </>
  )
}
