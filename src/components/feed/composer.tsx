'use client'

import { scrollToPosted } from '@/lib/scroll-to-post'
import { publishReplyDelta } from '@/lib/count-store'
import { useT, tx, tn } from '@/i18n/client'
import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Users, ShieldAlert, ImagePlus, X } from 'lucide-react'
import { toast } from 'sonner'
import { postedHref } from '@/lib/posted-rules'
import { offerPushAfterPosting } from '@/lib/push-client'
import { UserAvatar } from '@/components/user-avatar'
import { ComposerFrame, ComposerTextarea } from '@/components/composer/composer-frame'
import { VisibilityPicker } from '@/components/composer/visibility-picker'
import { canRestrict, type PostVisibility } from '@/lib/post-visibility'
import { canAskQuestion } from '@/lib/question-rules'
import { AgentReactionPicker } from '@/components/composer/agent-reaction-picker'
import { IdentityPicker, type IdentityOption } from '@/components/composer/identity-picker'
import { GroupAvatar } from '@/components/groups/group-avatar'
import { LinkCarousel } from '@/components/link-carousel'
import { useLinkPreviews } from '@/hooks/use-link-previews'
import type { AgentInteraction, PostAs } from '@/lib/supabase/types'
import { T } from '@/i18n/t'
import type { PickedImage } from '@/lib/post-image-client'
import { useComposer, useImageAttach } from '@/components/composer/use-composer'

export type ComposerIdentity = {
  id: string
  displayName: string
  avatarUrl: string | null
  /** B14: groups this member runs (owner/mod) — they may post under the group's name */
  groupIdentities?: Array<{ id: string; name: string }>
  /** A24: where the agent-reaction toggle starts (the member's last choice) */
  agentInteraction?: AgentInteraction
  /** A43: last 공유범위 */
  visibility?: PostVisibility
}

/**
 * Threads-style short-post composer (members only). Replies hide the
 * interaction setting (the root post decides whether agents may join).
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
  initialImage = null,
  initialQuestion = false,
  replyToLabel,
  onCancelReply,
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
  /** A62: an image already uploaded from the quick composer */
  initialImage?: PickedImage | null
  /** A97: the quick composer's 질문해요 switch was on */
  initialQuestion?: boolean
  /** A118: 대댓글 — who this reply answers; with onCancelReply, a 취소 control */
  replyToLabel?: string | null
  onCancelReply?: () => void
  placeholder?: string
  autoFocus?: boolean
  onPosted?: (id: string) => void
  /** replies: posts whose comment counts go up (root + the comment answered) */
  countIds?: string[]
  className?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const tr = useT()
  const [postedAs, setPostedAs] = useState<PostAs>('real')
  // 'real' | 'nickname' | 'group:<id>' (group identities only on root posts)
  const [who, setWho] = useState('real')
  const [interaction, setInteraction] = useState<AgentInteraction>(me.agentInteraction ?? 'agents_allowed')
  const [visibility, setVisibility] = useState<PostVisibility>(me.visibility ?? 'members')
  const [question, setQuestion] = useState(initialQuestion)
  const attach = useImageAttach(initialImage)
  const { image, setImage, uploading } = attach
  const isReply = Boolean(parentId)
  const asGroup = !isReply && who.startsWith('group:') ? (me.groupIdentities ?? []).find((g) => `group:${g.id}` === who) ?? null : null
  const restrictable = canRestrict({ isReply, groupId, asGroup: Boolean(asGroup), postedAs })
  const questionable = canAskQuestion({ isReply, groupId, asGroup: Boolean(asGroup), postedAs })
  // A24: the next post starts where this one was set (saved quietly; the toggle works even if saving fails)
  function pickInteraction(v: AgentInteraction) {
    setInteraction(v)
    void fetch('/api/agent-interaction', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: v }), keepalive: true }).catch(() => {})
  }

  // PII guard: warn before publishing; a second press posts anyway (the poster decides).
  const composer = useComposer({
    initialBody,
    piiNotice: (pii) => tx('{pii} 공개 글이에요. 그래도 올리려면 한 번 더 눌러주세요.', { pii }),
    errorFallback: () => tn('게시하지 못했어요.'),
    send: async (body) => {
      const res = await fetch('/api/feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body,
          parentId,
          postedAs: asGroup ? 'real' : postedAs,
          asGroupId: asGroup?.id,
          agentInteraction: groupId ? 'humans_only' : interaction,
          ...(restrictable ? { visibility } : {}),
          ...(questionable && question ? { isQuestion: true } : {}),
          groupId,
          ...(isReply ? {} : { urls: previews.urls }),
          ...(image ? { imagePath: image.path } : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || tx('게시하지 못했어요.'))
      setBody('')
      setQuestion(false)
      setImage(null)
      previews.reset()
      toast.success(isReply ? tn('답글을 남겼어요') : tn('게시했어요'))
      if (isReply && countIds?.length) publishReplyDelta(countIds, 1)
      offerPushAfterPosting(
        { ask: tn('답글이 달리면 바로 알려드릴까요?'), action: tn('알림 켜기'), on: tn('이 기기에서 알림을 받아요'), failed: tn('알림을 켜지 못했어요. 설정 → 알림에서 다시 켤 수 있어요.') },
        toast,
      )
      onPosted?.(data.id)
      if (isReply) scrollToPosted(data.id)
      // A23: a reply stays put; a new post opens the timeline it went to, scrolled to it
      if (isReply || !data.id) router.refresh()
      else if (groupId) router.replace(postedHref(pathname, data.id), { scroll: false })
      else router.push(postedHref('/feed', data.id))
    },
  })
  const { body, setBody, busy, pii, piiAcked, submit } = composer
  // live link previews (top-level posts only; replies never get cards)
  const previews = useLinkPreviews(body, !isReply)

  const imagePreview = image ? (
    <div className="composer-image">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image.preview} alt="" />
      <button type="button" className="composer-image-x" onClick={() => setImage(null)} aria-label={tx('이미지 빼기')}><X className="w-3.5 h-3.5" /></button>
    </div>
  ) : null
  const imageButton = (
    <>
      <button type="button" className="agent-react-btn" onClick={attach.open} disabled={uploading || Boolean(image)} aria-label={tx('이미지 한 장')} title={tx('이미지 한 장')}>
        <ImagePlus className="w-4 h-4 flex-shrink-0" />
        {uploading ? <span className="truncate"><T>올리는 중…</T></span> : isReply ? <span className="truncate"><T>이미지 한 장</T></span> : null}
      </button>
      {attach.input}
    </>
  )

  const options: IdentityOption[] = [
    { key: 'real', label: me.displayName, hint: tx('내 이름'), avatar: <UserAvatar id={me.id} name={me.displayName} avatarUrl={me.avatarUrl} size="sm" /> },
    ...(isReply ? [] : (me.groupIdentities ?? []).map((g) => ({ key: `group:${g.id}`, label: g.name, hint: tx('그룹 이름 · 작성자는 운영진만 봐요'), avatar: <GroupAvatar name={g.name} size={32} /> }))),
  ]
  return (
    <ComposerFrame
      className={className}
      compact={isReply}
      avatar={
        asGroup ? <GroupAvatar name={asGroup.name} /> : <UserAvatar id={me.id} name={me.displayName} avatarUrl={me.avatarUrl} />
      }
      head={
        options.length > 1 ? (
          <IdentityPicker
            options={options}
            value={asGroup ? who : postedAs}
            onChange={(k) => {
              setWho(k)
              setPostedAs(k === 'nickname' ? 'nickname' : 'real')
            }}
          />
        ) : (
          <span className="font-semibold text-n-111 truncate">{me.displayName}</span>
        )
      }
      tools={
        isReply ? (
          <>
            {imagePreview}
            <span className="composer-tools">{imageButton}</span>
          </>
        ) : (
          <span className="composer-tools">
            {groupId ? (
              <>
              {imageButton}
              <span className="composer-note">
                <Users className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{groupName ? tx('{groupName} 그룹에만 보여요 · 사람만', { groupName }) : tx('그룹에만 보여요 · 사람만')}</span>
              </span>
              </>
            ) : (
              <>
                {restrictable && <VisibilityPicker value={visibility} onChange={setVisibility} />}
                {questionable && (
                  <button type="button" className="qc-chip composer-q" aria-pressed={question} onClick={() => setQuestion((q) => !q)}>
                    <T>질문해요</T>
                  </button>
                )}
                {imageButton}
                <AgentReactionPicker value={interaction} onChange={pickInteraction} />
              </>
            )}
          </span>
        )
      }
      onSubmit={() => void submit()}
      canSubmit={Boolean(body.trim())}
      busy={busy}
      submitLabel={busy ? <T>게시 중…</T> : piiAcked ? <T>그래도 게시</T> : <T>게시</T>}
    >
      {replyToLabel && (
        <p className="composer-reply-to text-xs text-n-888">
          <T s="{name}님에게 답글" vars={{ name: replyToLabel }} />
          {onCancelReply && (
            <>
              {' '}
              <button type="button" className="body-link" onClick={onCancelReply}><T>취소</T></button>
            </>
          )}
        </p>
      )}
      <ComposerTextarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onSubmitShortcut={() => void submit()}
        mentions
        placeholder={placeholder ? tr(placeholder) : image ? tr('이미지에 한 줄 설명을 붙여 주세요') : isReply ? (replyKind === 'comment' ? tr('댓글 남기기… @로 태그') : tr('답글 남기기…')) : tr('무슨 생각을 하고 있나요? 링크를 붙이면 미리보기가 생겨요.')}
        autoFocus={autoFocus}
        rows={isReply ? 1 : 3}
        aria-label={isReply ? tx('답글 내용') : tx('게시물 내용')}
      />
      {pii && (
        <div role="alert" className="pii-warning flex items-start gap-1.5 rounded-lg px-2.5 py-2 text-xs mb-1" style={{ background: 'var(--c-fff4e5)', color: 'var(--c-8a4b00)' }}>
          <ShieldAlert className="w-3.5 h-3.5 mt-px flex-shrink-0" />
          <span><T s="{pii} 멤버 모두가 볼 수 있어요. 지우거나 가려주세요.{v}" vars={{ pii, v: piiAcked ? tx(' (한 번 더 누르면 그대로 게시돼요)') : '' }} /></span>
        </div>
      )}
      {!isReply && imagePreview}
      {!isReply && previews.items.length > 0 && (
        <div className="composer-previews mb-1">
          <LinkCarousel items={previews.items} onRemove={previews.remove} />
        </div>
      )}
    </ComposerFrame>
  )
}
