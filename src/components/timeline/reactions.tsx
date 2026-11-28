'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { SmilePlus, X, ArrowLeft, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { publishLike, useCounts } from '@/lib/count-store'
import { applyToggle, isCustomCode, normalizeShortcode, searchEmoji, THUMBS, CUSTOM_EMOJI_MAX_BYTES, CUSTOM_EMOJI_TYPES, type CustomEmoji, type ReactionSummary } from '@/lib/emoji-rules'
import { getReactions, loadCustomEmoji, reactionKey, setCustomEmoji, setReactions, useCustomEmoji, useReactions } from '@/lib/reaction-store'
import type { TimelineLiker } from './types'
import { tx, tn } from '@/i18n/client'
import { prepareUploadImage, prepareImageErrorMessage, PrepareImageError } from '@/lib/upload-image-client'

/** A39: Slack-style emoji reactions for feed posts and comments. 👍 = the post's like.
 *  A60: the same control on 아고라 posts (surface='agora' → /api/agora/…). */
export type ReactionSurface = 'feed' | 'agora'

type LikeState = { likeCount: number; liked: boolean }

async function toggleReaction(postId: string, emoji: string, on: boolean, like: LikeState, surface: ReactionSurface = 'feed') {
  const key = reactionKey(postId, surface)
  if (emoji === THUMBS) {
    publishLike(postId, Math.max(0, like.likeCount + (on ? 1 : -1)), on)
    try {
      const res = await fetch(`/api/${surface}/${postId}/like`, { method: on ? 'POST' : 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || tn('좋아요 실패'))
      if (typeof data.likeCount === 'number') publishLike(postId, data.likeCount, on)
    } catch (e) {
      publishLike(postId, like.likeCount, like.liked)
      toast.error(e instanceof Error ? e.message : tn('반응을 남기지 못했어요.'))
    }
    return
  }
  const before = getReactions(key)
  setReactions(key, applyToggle(before, emoji, on))
  try {
    const res = await fetch(`/api/${surface}/${postId}/reactions`, { method: on ? 'POST' : 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ emoji }) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || tn('반응을 남기지 못했어요.'))
    if (Array.isArray(data.reactions)) setReactions(key, data.reactions)
  } catch (e) {
    setReactions(key, before)
    toast.error(e instanceof Error ? e.message : tn('반응을 남기지 못했어요.'))
  }
}

function EmojiGlyph({ emoji, customs, size = 16 }: { emoji: string; customs: CustomEmoji[]; size?: number }) {
  if (!isCustomCode(emoji)) return <span className="rx-glyph" style={{ fontSize: size - 1 }}>{emoji}</span>
  const c = customs.find((x) => `:${x.shortcode}:` === emoji)
  // eslint-disable-next-line @next/next/no-img-element
  return c ? <img src={c.url} alt={emoji} width={size} height={size} className="rx-img" style={{ width: size, height: size }} /> : <span className="rx-code">{emoji}</span>
}

/** names of who reacted (hover on desktop, long-press on touch) */
function WhoReacted({ postId, emoji, count, surface }: { postId: string; emoji: string; count: number; surface: ReactionSurface }) {
  const [people, setPeople] = useState<TimelineLiker[] | null>(null)
  useEffect(() => {
    let off = false
    fetch(`/api/${surface}/${postId}/reactions?emoji=${encodeURIComponent(emoji)}`)
      .then((r) => r.json())
      .then((d) => !off && setPeople(d.people ?? []))
      .catch(() => !off && setPeople([]))
    return () => {
      off = true
    }
  }, [postId, emoji, count, surface])
  if (!people) return <span className="rx-who-muted">…</span>
  const shown = people.slice(0, 8).map((p) => p.name)
  const rest = Math.max(0, people.length - shown.length)
  const names = shown.join(', ')
  return (
    <span>
      {rest ? tx('{names} 외 {n}명', { names, n: rest }) : names} <span className="rx-who-muted">· {emoji}</span>
    </span>
  )
}

function Chip({ postId, r, customs, disabled, like, surface }: { postId: string; r: ReactionSummary; customs: CustomEmoji[]; disabled?: boolean; like: LikeState; surface: ReactionSurface }) {
  const [peek, setPeek] = useState(false)
  // A141: the glyph pops only when this click turns the reaction on
  const [pop, setPop] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressed = useRef(false)
  const clear = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }
  useEffect(() => {
    if (!peek) return
    const close = () => setPeek(false)
    document.addEventListener('pointerdown', close)
    document.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('scroll', close, true)
    }
  }, [peek])
  return (
    <span className="rx-wrap">
      <button
        type="button"
        className="rx-chip"
        data-on={r.mine ? '' : undefined}
        disabled={disabled}
        aria-pressed={r.mine}
        aria-label={r.mine ? tx('{emoji} 반응 취소 ({n})', { emoji: r.emoji, n: r.count }) : tx('{emoji} 반응 ({n})', { emoji: r.emoji, n: r.count })}
        onPointerEnter={(e) => {
          if (e.pointerType !== 'mouse') return
          clear()
          timer.current = setTimeout(() => setPeek(true), 350)
        }}
        onPointerLeave={(e) => {
          if (e.pointerType !== 'mouse') return
          clear()
          setPeek(false)
        }}
        onTouchStart={() => {
          longPressed.current = false
          clear()
          timer.current = setTimeout(() => {
            longPressed.current = true
            setPeek(true)
          }, 450)
        }}
        onTouchEnd={clear}
        onTouchMove={clear}
        onContextMenu={(e) => e.preventDefault()}
        onClick={() => {
          if (longPressed.current) {
            longPressed.current = false
            return
          }
          if (!r.mine) setPop((n) => n + 1)
          void toggleReaction(postId, r.emoji, !r.mine, like, surface)
        }}
      >
        <span key={pop} className={`inline-flex${pop > 0 && r.mine ? ' heart-pop' : ''}`}>
          <EmojiGlyph emoji={r.emoji} customs={customs} size={15} />
        </span>
        <span className="tabular-nums">{r.count}</span>
      </button>
      {peek && (
        <span className="rx-who" role="tooltip">
          <WhoReacted postId={postId} emoji={r.emoji} count={r.count} surface={surface} />
        </span>
      )}
    </span>
  )
}

/** chip row (renders nothing until someone reacts) */
export function ReactionChips({
  postId,
  initialLiked,
  initialCount,
  reactionCount,
  disabled,
  surface = 'feed',
}: {
  postId: string
  initialLiked: boolean
  initialCount: number
  reactionCount?: number
  disabled?: boolean
  surface?: ReactionSurface
}) {
  const counts = useCounts(postId, { likeCount: initialCount, liked: initialLiked, replyCount: 0 })
  const rest = useReactions(reactionKey(postId, surface), reactionCount === 0)
  const needCustom = rest.some((r) => isCustomCode(r.emoji))
  const { list: customs } = useCustomEmoji(needCustom)
  const all = useMemo(
    () => (counts.likeCount > 0 ? [{ emoji: THUMBS, count: counts.likeCount, mine: counts.liked }, ...rest] : rest),
    [counts.likeCount, counts.liked, rest]
  )
  if (!all.length) return null
  return (
    <div className="rx-row" data-rx-row>
      {all.map((r) => (
        <Chip key={r.emoji} postId={postId} r={r} customs={customs} disabled={disabled} like={counts} surface={surface} />
      ))}
    </div>
  )
}

/** footer button: opens the picker */
export function ReactionAddButton({ postId, initialLiked, initialCount, disabled, surface = 'feed' }: { postId: string; initialLiked: boolean; initialCount: number; disabled?: boolean; surface?: ReactionSurface }) {
  const [open, setOpen] = useState(false)
  const counts = useCounts(postId, { likeCount: initialCount, liked: initialLiked, replyCount: 0 })
  const rest = useReactions(reactionKey(postId, surface), true)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        className="tap-target inline-flex items-center justify-center rounded-full text-n-555 icon-btn hover:text-n-111 disabled:opacity-60"
        aria-label={tx('반응 추가')}
        data-rx-add
      >
        <SmilePlus className="w-[18px] h-[18px]" />
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="rx-picker w-[296px] p-2 gap-2">
        {open && (
          <Picker
            mineSet={new Set([...(counts.liked ? [THUMBS] : []), ...rest.filter((r) => r.mine).map((r) => r.emoji)])}
            onPick={(emoji, mine) => {
              setOpen(false)
              void toggleReaction(postId, emoji, !mine, counts, surface)
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  )
}

function Picker({ mineSet, onPick }: { mineSet: Set<string>; onPick: (emoji: string, mine: boolean) => void }) {
  const [q, setQ] = useState('')
  const [view, setView] = useState<'pick' | 'manage'>('pick')
  const { list: customs, isAdmin } = useCustomEmoji(true)
  const found = searchEmoji(q, customs)
  if (view === 'manage') return <ManageCustom customs={customs} isAdmin={isAdmin} onBack={() => setView('pick')} />
  const cell = (emoji: string, node: React.ReactNode, label: string) => (
    <button key={emoji} type="button" className="rx-cell" data-on={mineSet.has(emoji) ? '' : undefined} aria-label={label} title={label} onClick={() => onPick(emoji, mineSet.has(emoji))}>
      {node}
    </button>
  )
  return (
    <div className="flex flex-col gap-2">
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={tx('이모지 검색')}
        aria-label={tx('이모지 검색')}
        className="rx-search"
      />
      <div className="rx-grid" role="listbox" aria-label={tx('이모지')}>
        {found.curated.map((e) => cell(e, <span className="rx-glyph">{e}</span>, e))}
      </div>
      {found.custom.length > 0 && (
        <>
          <div className="rx-label">{tx('커스텀')}</div>
          <div className="rx-grid">
            {found.custom.map((c) => cell(`:${c.shortcode}:`, <EmojiGlyph emoji={`:${c.shortcode}:`} customs={customs} size={20} />, `:${c.shortcode}:`))}
          </div>
        </>
      )}
      {!found.curated.length && !found.custom.length && <div className="rx-empty">{tx('검색 결과가 없어요')}</div>}
      <button type="button" className="rx-foot text-link" onClick={() => setView('manage')}>
        <Plus className="w-3.5 h-3.5" /> {tx('커스텀 이모지')}
      </button>
    </div>
  )
}

function ManageCustom({ customs, isAdmin, onBack }: { customs: CustomEmoji[]; isAdmin: boolean; onBack: () => void }) {
  const [code, setCode] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  function clearFile() {
    setFile(null)
    setPreviewUrl((u) => {
      if (u) URL.revokeObjectURL(u)
      return null
    })
    if (fileRef.current) fileRef.current.value = ''
  }
  async function pickEmojiFile(picked?: File) {
    if (!picked) return
    try {
      const ready = await prepareUploadImage(picked, { maxBytes: CUSTOM_EMOJI_MAX_BYTES, maxSide: 256, allow: CUSTOM_EMOJI_TYPES })
      setPreviewUrl((u) => {
        if (u) URL.revokeObjectURL(u)
        return URL.createObjectURL(ready)
      })
      setFile(ready)
    } catch (e) {
      clearFile()
      const code = e instanceof PrepareImageError ? e.code : ''
      toast.error(code === 'image_size' ? tx('256KB 이하 이미지만 올릴 수 있어요.') : prepareImageErrorMessage(code || 'image_type', tx))
    }
  }
  const removable = customs.filter((c) => c.mine || isAdmin)
  async function upload() {
    const sc = normalizeShortcode(code)
    if (!sc) return toast.error(tx('이름은 영문 소문자, 숫자, _로 2~32자예요.'))
    if (!file) return toast.error(tx('이미지를 골라 주세요.'))
    setBusy(true)
    try {
      const fd = new FormData()
      fd.set('shortcode', sc)
      fd.set('file', file)
      const res = await fetch('/api/emoji', { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || tn('올리지 못했어요.'))
      setCustomEmoji([...customs, data.emoji].sort((a, b) => a.shortcode.localeCompare(b.shortcode)))
      setCode('')
      clearFile()
      toast.success(tx(':{code}: 이모지를 올렸어요', { code: sc }))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tn('올리지 못했어요.'))
    } finally {
      setBusy(false)
    }
  }
  async function remove(c: CustomEmoji) {
    const res = await fetch(`/api/emoji/${encodeURIComponent(c.shortcode)}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return toast.error(data.error || tn('삭제하지 못했어요.'))
    setCustomEmoji(customs.filter((x) => x.shortcode !== c.shortcode))
    void loadCustomEmoji(true)
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1">
        <button type="button" className="icon-btn rounded-full w-7 h-7 inline-flex items-center justify-center text-n-555" onClick={onBack} aria-label={tx('뒤로')}>
          <ArrowLeft className="w-4 h-4" />
        </button>
        <span className="text-[13px] font-semibold text-n-111">{tx('커스텀 이모지')}</span>
      </div>
      <div className="rx-upload">
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder={tx('이름 (예: party_parrot)')} aria-label={tx('이모지 이름')} className="rx-search" maxLength={34} />
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif" className="sr-only" id="rx-emoji-file" onChange={(e) => void pickEmojiFile(e.target.files?.[0])} />
        {file ? (
          <div className="rx-file-picked">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl ?? ''} alt="" className="rx-file-preview" />
            <span className="rx-file-name truncate">{file.name}</span>
            <button type="button" className="rx-file-act" onClick={() => fileRef.current?.click()}>{tx('다시 선택')}</button>
            <button type="button" className="rx-file-act" onClick={clearFile}>{tx('빼기')}</button>
          </div>
        ) : (
          <button type="button" className="rx-file-btn" onClick={() => fileRef.current?.click()}>
            {tx('이미지 선택')}
          </button>
        )}
        <div className="flex items-center justify-between gap-2">
          <span className="rx-hint">{tx('정사각형 이미지 · 256KB 이하')}</span>
          <button type="button" className="rx-btn" onClick={upload} disabled={busy || !file}>
            {tx('올리기')}
          </button>
        </div>
      </div>
      {removable.length > 0 && (
        <>
          <div className="rx-label">{isAdmin ? tx('모든 커스텀 이모지') : tx('내가 올린 이모지')}</div>
          <ul className="rx-manage">
            {removable.map((c) => (
              <li key={c.shortcode}>
                <EmojiGlyph emoji={`:${c.shortcode}:`} customs={customs} size={18} />
                <span className="truncate">:{c.shortcode}:</span>
                <button type="button" className="pe-chip-x" onClick={() => remove(c)} aria-label={tx(':{code}: 삭제', { code: c.shortcode })}>
                  <X className="w-3 h-3" strokeWidth={2.25} />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
