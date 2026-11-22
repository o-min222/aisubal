'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bot, Users, Link2 } from 'lucide-react'
import { toast } from 'sonner'
import { UserAvatar } from '@/components/user-avatar'
import { FEED_MAX_CHARS } from '@/lib/feed-rules'
import type { AgentInteraction, PostAs } from '@/lib/supabase/types'

export type ComposerIdentity = {
  id: string
  displayName: string
  avatarUrl: string | null
  nickname: string | null
  nicknameAvatarUrl: string | null
  nicknameAvailable: boolean
}

/**
 * Threads-style short-post composer (members only). Replies hide the
 * interaction setting: the root post decides whether agents may join.
 */
export function Composer({
  me,
  parentId,
  placeholder,
  autoFocus,
  onPosted,
  className = '',
}: {
  me: ComposerIdentity
  parentId?: string
  placeholder?: string
  autoFocus?: boolean
  onPosted?: (id: string) => void
  className?: string
}) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [postedAs, setPostedAs] = useState<PostAs>('real')
  const [interaction, setInteraction] = useState<AgentInteraction>('humans_only')
  const [busy, setBusy] = useState(false)
  const count = [...body].length
  const over = count > FEED_MAX_CHARS
  const isReply = Boolean(parentId)
  const hasLink = /https?:\/\/\S+/.test(body)

  async function submit() {
    if (!body.trim() || over || busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, parentId, postedAs, agentInteraction: interaction }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '게시하지 못했어요.')
      setBody('')
      toast.success(isReply ? '답글을 남겼어요' : '게시했어요')
      onPosted?.(data.id)
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '게시하지 못했어요.')
    } finally {
      setBusy(false)
    }
  }

  const asNick = postedAs === 'nickname' && me.nickname
  return (
    <div className={`composer ${className}`}>
      <div className="flex gap-3">
        <UserAvatar
          id={asNick ? `nick-${me.id}` : me.id}
          name={asNick ? me.nickname! : me.displayName}
          avatarUrl={asNick ? me.nicknameAvatarUrl : me.avatarUrl}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold text-[#111]">{asNick ? me.nickname : me.displayName}</span>
            {me.nicknameAvailable && (
              <button
                type="button"
                className="text-xs text-[#0066cc] min-h-[32px]"
                onClick={() => setPostedAs(postedAs === 'real' ? 'nickname' : 'real')}
              >
                {postedAs === 'real' ? '별명으로 쓰기' : '실명으로 쓰기'}
              </button>
            )}
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
            }}
            placeholder={placeholder || (isReply ? '답글 남기기…' : '무슨 생각을 하고 있나요? 링크를 붙이면 미리보기가 생겨요.')}
            autoFocus={autoFocus}
            rows={isReply ? 2 : 3}
            aria-label={isReply ? '답글 내용' : '게시물 내용'}
            className="composer-input"
          />
          {hasLink && !isReply && (
            <div className="flex items-center gap-1.5 text-xs text-[#666] mb-2">
              <Link2 className="w-3.5 h-3.5" /> 게시하면 첫 링크의 미리보기 카드가 붙어요
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {!isReply && (
              <div className="seg" role="radiogroup" aria-label="상호작용 설정">
                <button
                  type="button"
                  role="radio"
                  aria-checked={interaction === 'humans_only'}
                  className={interaction === 'humans_only' ? 'on' : ''}
                  onClick={() => setInteraction('humans_only')}
                >
                  <Users className="w-3.5 h-3.5" /> 사람만
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={interaction === 'agents_allowed'}
                  className={interaction === 'agents_allowed' ? 'on' : ''}
                  onClick={() => setInteraction('agents_allowed')}
                >
                  <Bot className="w-3.5 h-3.5" /> 에이전트도 허용
                </button>
              </div>
            )}
            <div className="ml-auto flex items-center gap-2">
            <span className={`text-xs tabular-nums ${over ? 'text-red-600' : 'text-[#999]'}`}>
              {count}/{FEED_MAX_CHARS}
            </span>
            <button
              type="button"
              onClick={submit}
              disabled={!body.trim() || over || busy}
              className="btn btn-primary btn-sm min-h-[40px] px-4 rounded-full"
            >
              {busy ? '게시 중…' : isReply ? '답글' : '게시'}
            </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
