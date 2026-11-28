'use client'

import { useEffect, useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { AdaptiveSheet } from '@/components/adaptive-sheet'
import { T } from '@/i18n/t'
import { tn, tx } from '@/i18n/client'
import { articleImageSrc } from '@/lib/article-rules'
import type { ArticleLibraryImage } from '@/lib/data/article-images'

/**
 * A136: the member's reusable images (covers and thumbnails they uploaded before, newest first).
 * Pick one to use it again; ✕ removes it from the library only. An article that already uses the image keeps it.
 */
export function ArticleImagePicker({
  open,
  onOpenChange,
  title,
  currentPath,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  currentPath?: string | null
  onPick: (image: ArticleLibraryImage) => void
}) {
  const [images, setImages] = useState<ArticleLibraryImage[] | null>(null)
  const [total, setTotal] = useState(0)
  const [cap, setCap] = useState(100)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!open) return
    let live = true
    fetch('/api/article-image/library', { cache: 'no-store' })
      .then((res) => (res.ok ? (res.json() as Promise<{ images: ArticleLibraryImage[]; total: number; cap: number }>) : null))
      .catch(() => null)
      .then((d) => {
        if (!live) return
        setFailed(!d)
        setImages(d?.images ?? [])
        setTotal(d?.total ?? 0)
        setCap(d?.cap ?? 100)
      })
    return () => {
      live = false
    }
  }, [open])

  async function remove(img: ArticleLibraryImage) {
    setBusy(img.id)
    const res = await fetch(`/api/article-image/library?id=${encodeURIComponent(img.id)}`, { method: 'DELETE' }).catch(() => null)
    setBusy(null)
    if (!res?.ok) return toast.error(tn('지우지 못했어요.'))
    setConfirm(null)
    setImages((list) => (list ?? []).filter((x) => x.id !== img.id))
    setTotal((n) => Math.max(0, n - 1))
    toast.success(tn('보관함에서 지웠어요.'))
  }

  return (
    <AdaptiveSheet open={open} onOpenChange={(o) => { if (!o) setConfirm(null); onOpenChange(o) }} title={title} className="sm:!max-w-xl" showClose>
      <div className="article-picker">
        <p className="article-picker-note">
          <T>예전에 올린 이미지를 다시 쓸 수 있어요. 보관함에서 지워도 이미 그 이미지를 쓴 글은 그대로예요.</T>
        </p>
        {images === null ? (
          <p className="article-picker-empty" role="status"><Loader2 className="w-4 h-4 animate-spin" aria-hidden /> <T>불러오는 중…</T></p>
        ) : failed ? (
          <p className="article-picker-empty"><T>이미지를 불러오지 못했어요.</T></p>
        ) : images.length === 0 ? (
          <p className="article-picker-empty"><T>아직 보관한 이미지가 없어요. 커버나 썸네일을 올리면 여기에 쌓여요.</T></p>
        ) : (
          <ul className="article-picker-grid">
            {images.map((img) => {
              const src = articleImageSrc(img.path)
              const on = img.path === currentPath
              return (
                <li key={img.id} className={`article-picker-item${on ? ' is-current' : ''}`}>
                  <button
                    type="button"
                    className="article-picker-pick"
                    onClick={() => { onPick(img); onOpenChange(false) }}
                    aria-label={tx('이 이미지 쓰기: {name}', { name: img.name || tx('이름 없는 이미지') })}
                    aria-pressed={on}
                  >
                    {src && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={src} alt="" loading="lazy" />
                    )}
                    <span className="article-picker-meta">
                      {on ? <T>지금 쓰는 중</T> : img.usedBy > 0 ? <T s="글 {n}개에서 사용" vars={{ n: String(img.usedBy) }} /> : <T>아직 안 씀</T>}
                      {img.byAgent ? <> · <T>AI가 올림</T></> : null}
                    </span>
                  </button>
                  {confirm === img.id ? (
                    <div className="article-picker-confirm" role="group" aria-label={tx('보관함에서 지우기')}>
                      <p><T>보관함에서 지울까요?</T></p>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirm(null)} disabled={busy === img.id}><T>취소</T></button>
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => void remove(img)} disabled={busy === img.id}><T>지우기</T></button>
                    </div>
                  ) : (
                    <button type="button" className="article-picker-x" onClick={() => setConfirm(img.id)} aria-label={tx('보관함에서 지우기')} title={tx('보관함에서 지우기')}>
                      <Trash2 className="w-4 h-4" aria-hidden />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        <p className="article-picker-count">{tx('보관함 {n}/{cap}', { n: total, cap })}</p>
      </div>
    </AdaptiveSheet>
  )
}
