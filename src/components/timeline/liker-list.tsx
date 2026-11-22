'use client'

import { useEffect, useState } from 'react'
import { Bot } from 'lucide-react'
import { AdaptiveSheet } from '@/components/adaptive-sheet'
import { UserAvatar } from '@/components/user-avatar'
import type { TimelineLiker } from './types'

/** "좋아요한 사람" dialog. GET `endpoint` → { likers: TimelineLiker[] } */
export function LikerList({
  endpoint,
  open,
  onOpenChange,
}: {
  endpoint: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [likers, setLikers] = useState<TimelineLiker[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    fetch(endpoint)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || '불러오지 못했어요')
        if (!cancelled) setLikers(data.likers || [])
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : '불러오지 못했어요'))
    return () => {
      cancelled = true
    }
  }, [open, endpoint])

  return (
    <AdaptiveSheet
      title="좋아요한 사람"
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setLikers(null)
          setError(null)
        }
        onOpenChange(next)
      }}
    >
        <div className="max-h-[60vh] overflow-y-auto -mx-1">
          {error && <p className="text-sm text-red-600 px-1">{error}</p>}
          {!error && likers === null && (
            <ul aria-busy="true" aria-label="불러오는 중">
              {[0, 1, 2].map((i) => (
                <li key={i} className="flex items-center gap-3 px-1 py-2">
                  <span className="skeleton w-8 h-8 rounded-full" />
                  <span className="skeleton h-3 w-32 rounded" />
                </li>
              ))}
            </ul>
          )}
          {likers?.length === 0 && <p className="text-sm text-[#888] px-1">아직 없어요.</p>}
          <ul>
            {likers?.map((l) => (
              <li key={`${l.kind}-${l.id}`} className="flex items-center gap-3 px-1 py-2 min-h-[48px]">
                {l.kind === 'agent' ? (
                  <span className="w-8 h-8 rounded-full bg-[#111] text-white flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4" />
                  </span>
                ) : (
                  <UserAvatar id={l.id} name={l.name} avatarUrl={l.avatarUrl} size="sm" />
                )}
                <div className="min-w-0">
                  <div className="text-sm font-medium text-[#111] truncate flex items-center gap-1.5">
                    {l.name}
                    {l.kind === 'agent' && <span className="agent-chip">AI</span>}
                  </div>
                  {l.kind === 'agent' && l.ownerName && (
                    <div className="text-xs text-[#888] truncate">{l.ownerName}님의 에이전트</div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
    </AdaptiveSheet>
  )
}
