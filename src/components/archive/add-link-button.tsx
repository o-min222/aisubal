'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Link2, Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { AdaptiveSheet } from '@/components/adaptive-sheet'
import { LinkCard } from '@/components/link-card'
import { T } from '@/i18n/t'
import { tn, tx } from '@/i18n/client'
import { ARCHIVE_MEMO_MAX, cleanTags } from '@/lib/archive-rules'
import type { LinkPreview } from '@/lib/supabase/types'

/** '+ 링크 담기': paste a URL, see the preview, add memo/tags, save. */
export function AddLinkButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [memo, setMemo] = useState('')
  const [tags, setTags] = useState('')
  const [preview, setPreview] = useState<LinkPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const valid = /^https?:\/\/\S+\.\S+/i.test(url.trim())

  useEffect(() => {
    setPreview(null)
    if (!valid) return
    const u = url.trim()
    const t = setTimeout(() => {
      setLoading(true)
      fetch(`/api/og-preview?url=${encodeURIComponent(u)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d?.preview && setPreview(d.preview))
        .catch(() => {})
        .finally(() => setLoading(false))
    }, 400)
    return () => clearTimeout(t)
  }, [url, valid])

  async function save() {
    setSaving(true)
    try {
      const r = await fetch('/api/archive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'link', ref: url.trim(), memo, tags: cleanTags(tags), hint: preview ? { title: preview.title ?? undefined, excerpt: preview.description ?? undefined } : undefined }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      toast.success(d.created ? tn('아카이브에 담았어요') : tn('이미 담겨 있어요'))
      setOpen(false)
      setUrl('')
      setMemo('')
      setTags('')
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : tn('네트워크 오류'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn btn-secondary btn-sm inline-flex items-center gap-1 flex-shrink-0 rounded-full">
        <Plus className="w-4 h-4" /> <T>링크 담기</T>
      </button>
      <AdaptiveSheet open={open} onOpenChange={setOpen} title={tx('링크 담기')}>
        <form
          className="space-y-3 min-w-0"
          onSubmit={(e) => {
            e.preventDefault()
            if (valid && !saving) void save()
          }}
        >
          <label className="archive-input flex items-center gap-2">
            <Link2 className="w-4 h-4 text-[#999] flex-shrink-0" />
            <input type="url" inputMode="url" autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" aria-label={tx('URL')} className="min-w-0 flex-1 bg-transparent outline-none" />
            {loading && <Loader2 className="w-4 h-4 animate-spin text-[#999]" />}
          </label>
          {preview && <LinkCard link={preview} compact />}
          <textarea value={memo} maxLength={ARCHIVE_MEMO_MAX} rows={2} onChange={(e) => setMemo(e.target.value)} placeholder={tx('메모 (선택, 나만 봐요)')} className="archive-input" />
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder={tx('#태그 (선택)')} className="archive-input" />
          <div className="flex justify-end">
            <button type="submit" disabled={!valid || saving} className="btn btn-primary btn-sm inline-flex items-center gap-1.5">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} <T>담기</T>
            </button>
          </div>
        </form>
      </AdaptiveSheet>
    </>
  )
}
