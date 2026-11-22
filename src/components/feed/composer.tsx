'use client'

import { piiWarning } from '@/lib/pii'
import { useT, tx, tn } from '@/i18n/client'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Bot, Users, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { UserAvatar } from '@/components/user-avatar'
import { FEED_MAX_CHARS } from '@/lib/feed-rules'
import { LinkCarousel } from '@/components/link-carousel'
import { useLinkPreviews } from '@/hooks/use-link-previews'
import type { AgentInteraction, PostAs } from '@/lib/supabase/types'
import { T } from '@/i18n/t'

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
  groupId,
  groupName,
  initialBody = '',
}: {
  me: ComposerIdentity
  parentId?: string
  /** posting into a group timeline (always humans-only) */
  groupId?: string
  groupName?: string
  /** prefilled text, e.g. '물어보기' from a tool page */
  initialBody?: string
  placeholder?: string
  autoFocus?: boolean
  onPosted?: (id: string) => void
  className?: string
}) {
  const router = useRouter()
  const tr = useT()
  const [body, setBody] = useState(initialBody)
  const [postedAs, setPostedAs] = useState<PostAs>('real')
  const [interaction, setInteraction] = useState<AgentInteraction>('humans_only')
  const [busy, setBusy] = useState(false)
  const count = [...body].length
  const over = count > FEED_MAX_CHARS
  const isReply = Boolean(parentId)
  // live link previews (top-level posts only; replies never get cards)
  const previews = useLinkPreviews(body, !isReply)
  // PII guard: warn before publishing; a second press posts anyway (the poster decides).
  const pii = useMemo(() => piiWarning(body), [body])
  const [piiAckFor, setPiiAckFor] = useState<string | null>(null)
  const piiPending = Boolean(pii) && piiAckFor !== body

  async function submit() {
    if (!body.trim() || over || busy) return
    if (piiPending) {
      setPiiAckFor(body)
      toast.warning(tx('{pii} 공개 글이에요. 그래도 올리려면 한 번 더 눌러주세요.', { pii: pii ?? '' }))
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body,
          parentId,
          postedAs,
          agentInteraction: groupId ? 'humans_only' : interaction,
          groupId,
          ...(isReply ? {} : { urls: previews.urls }),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '게시하지 못했어요.')
      setBody('')
      previews.reset()
      toast.success(isReply ? tn('답글을 남겼어요') : tn('게시했어요'))
      onPosted?.(data.id)
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tn('게시하지 못했어요.'))
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
                {postedAs === 'real' ? <T>부캐로 쓰기</T> : <T>기본 프로필로 쓰기</T>}
              </button>
            )}
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
            }}
            placeholder={placeholder ? tr(placeholder) : isReply ? tr('답글 남기기…') : tr('무슨 생각을 하고 있나요? 링크를 붙이면 미리보기가 생겨요.')}
            autoFocus={autoFocus}
            rows={isReply ? 2 : 3}
            aria-label={isReply ? tx('답글 내용') : tx('게시물 내용')}
            className="composer-input"
          />
          {pii && (
            <div role="alert" className="pii-warning flex items-start gap-1.5 rounded-lg px-2.5 py-2 text-xs mb-2" style={{ background: '#fff4e5', color: '#8a4b00' }}>
              <ShieldAlert className="w-3.5 h-3.5 mt-px flex-shrink-0" />
              <span><T s="{pii} 멤버 모두가 볼 수 있어요. 지우거나 가려주세요.{v}" vars={{ pii, v: piiAckFor === body ? tx(' (한 번 더 누르면 그대로 게시돼요)') : '' }} /></span>
            </div>
          )}
          {!isReply && previews.items.length > 0 && (
            <div className="composer-previews mb-2">
              <LinkCarousel items={previews.items} onRemove={previews.remove} />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {!isReply && groupId && (
              <span className="text-xs text-[#666] inline-flex items-center gap-1">
                <Users className="w-3.5 h-3.5" /> {groupName ? tx('{groupName} 그룹에만 보여요 · 사람만', { groupName }) : tx('그룹에만 보여요 · 사람만')}
              </span>
            )}
            {!isReply && !groupId && (
              <div className="seg" role="radiogroup" aria-label={tx('상호작용 설정')}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={interaction === 'humans_only'}
                  className={interaction === 'humans_only' ? 'on' : ''}
                  onClick={() => setInteraction('humans_only')}
                >
                  <Users className="w-3.5 h-3.5" /> <T>사람만</T>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={interaction === 'agents_allowed'}
                  className={interaction === 'agents_allowed' ? 'on' : ''}
                  onClick={() => setInteraction('agents_allowed')}
                >
                  <Bot className="w-3.5 h-3.5" /> <T>에이전트도 허용</T>
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
              {busy ? <T>게시 중…</T> : piiAckFor === body && pii ? <T>그래도 게시</T> : isReply ? <T>답글</T> : <T>게시</T>}
            </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
