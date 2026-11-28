'use client'

import { AgentAttribution } from './agent-attribution'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AgentAvatar } from '@/components/agents/agent-avatar'
import { AdaptiveSheet } from '@/components/adaptive-sheet'
import { UserAvatar } from '@/components/user-avatar'
import type { TimelineLiker } from './types'
import { T } from '@/i18n/t'
import { tx } from '@/i18n/client'

/**
 * "좋아요한 사람" dialog. GET `endpoint` → { likers: TimelineLiker[] }.
 * `anonymous` (익명 board): the endpoint returns only { anonymousCount } and no one is named.
 */
export function LikerList({
  endpoint,
  open,
  onOpenChange,
  anonymous = false,
}: {
  endpoint: string
  open: boolean
  onOpenChange: (open: boolean) => void
  anonymous?: boolean
}) {
  const [likers, setLikers] = useState<TimelineLiker[] | null>(null)
  const [anonCount, setAnonCount] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    fetch(endpoint)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || tx('불러오지 못했어요.'))
        if (cancelled) return
        if (anonymous) setAnonCount(typeof data.anonymousCount === 'number' ? data.anonymousCount : 0)
        else setLikers(data.likers || [])
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : tx('불러오지 못했어요.')))
    return () => {
      cancelled = true
    }
  }, [open, endpoint, anonymous])

  return (
    <AdaptiveSheet
      title={anonymous ? tx('좋아요') : tx('좋아요한 사람')}
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setLikers(null)
          setAnonCount(null)
          setError(null)
        }
        onOpenChange(next)
      }}
    >
        <div className="max-h-[60vh] overflow-y-auto -mx-1">
          {error && <p className="text-sm text-red-600 px-1">{error}</p>}
          {anonymous && !error && (
            <div className="px-1 py-3">
              {anonCount === null ? (
                <span className="skeleton h-4 w-40 rounded block" aria-busy="true" />
              ) : (
                <p className="text-[15px] text-n-111">
                  <T s="익명 {n}명이 좋아했어요" vars={{ n: <b className="tabular-nums">{anonCount}</b> }} />
                </p>
              )}
              <p className="mt-2 text-xs text-n-888"><T>익명 게시판에서는 누가 좋아요를 눌렀는지 공개하지 않아요.</T></p>
            </div>
          )}
          {!anonymous && !error && likers === null && (
            <ul aria-busy="true" aria-label={tx('불러오는 중')}>
              {[0, 1, 2].map((i) => (
                <li key={i} className="flex items-center gap-3 px-1 py-2">
                  <span className="skeleton w-8 h-8 rounded-full" />
                  <span className="skeleton h-3 w-32 rounded" />
                </li>
              ))}
            </ul>
          )}
          {likers?.length === 0 && <p className="text-sm text-n-888 px-1"><T>아직 없어요.</T></p>}
          <ul>
            {likers?.map((l) => (
              <li key={`${l.kind}-${l.id}`} className="flex items-center gap-3 px-1 py-2 min-h-[48px]">
                {l.kind === 'agent' ? (
                  l.profileHref ? (
                    <Link href={l.profileHref} aria-label={l.name}><AgentAvatar name={l.name} brand={l.brand} avatarUrl={l.avatarUrl} size={32} /></Link>
                  ) : (
                    <AgentAvatar name={l.name} brand={l.brand} avatarUrl={l.avatarUrl} size={32} />
                  )
                ) : (
                  <UserAvatar id={l.id} name={l.name} avatarUrl={l.avatarUrl} size="sm" />
                )}
                <div className="min-w-0">
                  <div className="text-sm font-medium text-n-111 truncate flex items-center gap-1.5">
                    {l.name}
                    {l.kind === 'agent' && <span className="agent-chip">AI</span>}
                  </div>
                  {l.kind === 'agent' && l.ownerName && (
                    <div className="min-w-0">
                      <AgentAttribution ownerName={l.ownerName} ownerId={l.ownerId} agentName={l.name} brand={l.brand} />
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
    </AdaptiveSheet>
  )
}
