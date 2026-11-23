'use client'

import { useState } from 'react'
import { Bookmark, BookmarkCheck } from 'lucide-react'
import { toast } from 'sonner'
import { AdaptiveSheet } from '@/components/adaptive-sheet'
import { T } from '@/i18n/t'
import { tn, tx } from '@/i18n/client'
import { ARCHIVE_MEMO_MAX, cleanTags, type ArchiveKind } from '@/lib/archive-rules'
import { setSaved, useIsSaved } from './archive-store'

export type ArchiveHint = { title?: string; excerpt?: string; url?: string; author?: string }

/**
 * '아카이브에 담기': one tap saves (private), the toast offers 메모·태그.
 * Tap again on a saved item to edit its memo/tags or take it out.
 */
export function ArchiveButton({
  kind,
  refId,
  hint,
  variant = 'icon',
  className = '',
}: {
  kind: ArchiveKind
  refId: string
  hint?: ArchiveHint
  variant?: 'icon' | 'pill'
  className?: string
}) {
  const saved = useIsSaved(kind, refId)
  const [busy, setBusy] = useState(false)
  const [sheet, setSheet] = useState<{ id: string | null; memo: string; tags: string } | null>(null)

  async function save() {
    setBusy(true)
    setSaved(kind, refId, true)
    try {
      const res = await fetch('/api/archive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, ref: refId, hint }) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || tn('아카이브에 담지 못했어요.'))
      toast.success(tn('아카이브에 담았어요'), {
        action: { label: tn('메모·태그'), onClick: () => setSheet({ id: d.item.id, memo: d.item.memo ?? '', tags: (d.item.tags ?? []).join(' ') }) },
      })
    } catch (e) {
      setSaved(kind, refId, false)
      toast.error(e instanceof Error ? e.message : tn('네트워크 오류'))
    } finally {
      setBusy(false)
    }
  }

  async function openEdit() {
    // Saved earlier: only read the row for the memo/tags sheet — never re-POST (N-5).
    setBusy(true)
    try {
      const res = await fetch(`/api/archive?kind=${kind}&ref=${encodeURIComponent(refId)}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setSheet({ id: d.item.id, memo: d.item.memo ?? '', tags: (d.item.tags ?? []).map((t: string) => `#${t}`).join(' ') })
    } catch {
      toast.error(tn('네트워크 오류'))
    } finally {
      setBusy(false)
    }
  }

  async function saveMeta() {
    if (!sheet?.id) return setSheet(null)
    const res = await fetch(`/api/archive/${sheet.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memo: sheet.memo, tags: cleanTags(sheet.tags) }) })
    if (res.ok) toast.success(tn('저장했어요'))
    else toast.error(tn('저장 실패'))
    setSheet(null)
  }

  async function remove() {
    setSheet(null)
    setSaved(kind, refId, false)
    const res = await fetch(`/api/archive?kind=${kind}&ref=${encodeURIComponent(refId)}`, { method: 'DELETE' })
    if (!res.ok) {
      setSaved(kind, refId, true)
      toast.error(tn('네트워크 오류'))
    } else toast(tn('아카이브에서 뺐어요'))
  }

  const Icon = saved ? BookmarkCheck : Bookmark
  const label = saved ? tx('아카이브에 담김') : tx('아카이브에 담기')
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (!busy) void (saved ? openEdit() : save())
        }}
        aria-pressed={saved}
        aria-label={label}
        title={label}
        disabled={busy}
        className={
          variant === 'pill'
            ? `archive-pill ${saved ? 'is-saved' : ''} ${className}`
            : `tap-target inline-flex items-center justify-center rounded-full icon-btn ${saved ? 'text-n-111' : 'text-n-555 hover:text-n-111'} ${className}`
        }
      >
        <Icon className={variant === 'pill' ? 'w-4 h-4' : 'w-[17px] h-[17px]'} fill={saved ? 'currentColor' : 'none'} strokeWidth={saved ? 1.6 : 2} />
        {variant === 'pill' && <span>{saved ? <T>담김</T> : <T>아카이브에 담기</T>}</span>}
      </button>
      <AdaptiveSheet open={!!sheet} onOpenChange={(o) => !o && setSheet(null)} title={tx('메모·태그')}>
        {sheet && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              void saveMeta()
            }}
          >
            <label className="block">
              <span className="text-xs text-n-777"><T>메모 (나만 봐요)</T></span>
              <textarea
                value={sheet.memo}
                maxLength={ARCHIVE_MEMO_MAX}
                rows={3}
                autoFocus
                onChange={(e) => setSheet({ ...sheet, memo: e.target.value })}
                placeholder={tx('왜 담았는지 한 줄로')}
                className="mt-1 w-full rounded-lg border border-n-e5e5e5 px-3 py-2 text-sm outline-none focus:border-n-111 bg-transparent"
              />
            </label>
            <label className="block">
              <span className="text-xs text-n-777"><T>태그 (띄어쓰기로 구분)</T></span>
              <input
                value={sheet.tags}
                onChange={(e) => setSheet({ ...sheet, tags: e.target.value })}
                placeholder="#mcp #나중에"
                className="mt-1 w-full rounded-lg border border-n-e5e5e5 px-3 py-2 text-sm outline-none focus:border-n-111 bg-transparent"
              />
            </label>
            <div className="flex items-center justify-between gap-2 pt-1">
              <button type="button" onClick={() => void remove()} className="text-sm text-c-c0392b">
                <T>아카이브에서 빼기</T>
              </button>
              <button type="submit" className="btn btn-primary btn-sm">
                <T>저장</T>
              </button>
            </div>
          </form>
        )}
      </AdaptiveSheet>
    </>
  )
}

/** Infer the archive kind from a PostCard's like endpoint. */
export function archiveKindForEndpoint(endpoint: string | undefined): ArchiveKind | null {
  const m = /^\/api\/(feed|agora|anon)\//.exec(endpoint ?? '')
  return m ? ({ feed: 'post', agora: 'agora', anon: 'anon' } as const)[m[1] as 'feed' | 'agora' | 'anon'] : null
}
