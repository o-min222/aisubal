'use client'

import { piiWarning } from '@/lib/pii'
import { publishReplyDelta } from '@/lib/count-store'
import { useT, tx, tn } from '@/i18n/client'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Users, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { UserAvatar } from '@/components/user-avatar'
import { ComposerFrame, ComposerTextarea } from '@/components/composer/composer-frame'
import { AgentReactionPicker } from '@/components/composer/agent-reaction-picker'
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
  replyKind = 'reply',
  placeholder,
  autoFocus,
  onPosted,
  countIds,
  className = '',
  groupId,
  groupName,
  initialBody = '',
}: {
  me: ComposerIdentity
  parentId?: string
  /** under a thread: 'comment' answers the post (댓글), 'reply' answers a comment (대댓글) */
  replyKind?: 'comment' | 'reply'
  /** posting into a group timeline (always humans-only) */
  groupId?: string
  groupName?: string
  /** prefilled text, e.g. '물어보기' from a tool page */
  initialBody?: string
  placeholder?: string
  autoFocus?: boolean
  onPosted?: (id: string) => void
  /** replies: posts whose comment counts go up (root + the comment answered) */
  countIds?: string[]
  className?: string
}) {
  const router = useRouter()
  const tr = useT()
  const [body, setBody] = useState(initialBody)
  const [postedAs, setPostedAs] = useState<PostAs>('real')
  const [interaction, setInteraction] = useState<AgentInteraction>('humans_only')
  const [busy, setBusy] = useState(false)
  const isReply = Boolean(parentId)
  // live link previews (top-level posts only; replies never get cards)
  const previews = useLinkPreviews(body, !isReply)
  // PII guard: warn before publishing; a second press posts anyway (the poster decides).
  const pii = useMemo(() => piiWarning(body), [body])
  const [piiAckFor, setPiiAckFor] = useState<string | null>(null)
  const piiPending = Boolean(pii) && piiAckFor !== body

  async function submit() {
    if (!body.trim() || busy) return
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
      if (isReply && countIds?.length) publishReplyDelta(countIds, 1)
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
    <ComposerFrame
      className={className}
      avatar={
        <UserAvatar
          id={asNick ? `nick-${me.id}` : me.id}
          name={asNick ? me.nickname! : me.displayName}
          avatarUrl={asNick ? me.nicknameAvatarUrl : me.avatarUrl}
        />
      }
      head={
        <>
          <span className="font-semibold text-n-111 truncate">{asNick ? me.nickname : me.displayName}</span>
          {me.nicknameAvailable && (
            <button type="button" className="composer-link" onClick={() => setPostedAs(postedAs === 'real' ? 'nickname' : 'real')}>
              {postedAs === 'real' ? <T>부캐로 쓰기</T> : <T>기본 프로필로 쓰기</T>}
            </button>
          )}
        </>
      }
      tools={
        isReply ? null : groupId ? (
          <span className="composer-note">
            <Users className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{groupName ? tx('{groupName} 그룹에만 보여요 · 사람만', { groupName }) : tx('그룹에만 보여요 · 사람만')}</span>
          </span>
        ) : (
          <AgentReactionPicker value={interaction} onChange={setInteraction} />
        )
      }
      onSubmit={submit}
      canSubmit={Boolean(body.trim())}
      busy={busy}
      submitLabel={busy ? <T>게시 중…</T> : piiAckFor === body && pii ? <T>그래도 게시</T> : isReply ? (replyKind === 'comment' ? <T>댓글</T> : <T>답글</T>) : <T>게시</T>}
    >
      <ComposerTextarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onSubmitShortcut={submit}
        placeholder={placeholder ? tr(placeholder) : isReply ? (replyKind === 'comment' ? tr('댓글 남기기…') : tr('답글 남기기…')) : tr('무슨 생각을 하고 있나요? 링크를 붙이면 미리보기가 생겨요.')}
        autoFocus={autoFocus}
        rows={isReply ? 2 : 3}
        aria-label={isReply ? tx('답글 내용') : tx('게시물 내용')}
      />
      {pii && (
        <div role="alert" className="pii-warning flex items-start gap-1.5 rounded-lg px-2.5 py-2 text-xs mb-1" style={{ background: 'var(--c-fff4e5)', color: 'var(--c-8a4b00)' }}>
          <ShieldAlert className="w-3.5 h-3.5 mt-px flex-shrink-0" />
          <span><T s="{pii} 멤버 모두가 볼 수 있어요. 지우거나 가려주세요.{v}" vars={{ pii, v: piiAckFor === body ? tx(' (한 번 더 누르면 그대로 게시돼요)') : '' }} /></span>
        </div>
      )}
      {!isReply && previews.items.length > 0 && (
        <div className="composer-previews mb-1">
          <LinkCarousel items={previews.items} onRemove={previews.remove} />
        </div>
      )}
    </ComposerFrame>
  )
}
