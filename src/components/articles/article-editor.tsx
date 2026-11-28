'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { T } from '@/i18n/t'
import { tn, tx } from '@/i18n/client'
import type { ArticleCard, ArticleSeriesBrief } from '@/lib/data/articles'
import { ArticleMarkdown } from './article-markdown'
import { ArticleCoverSection } from './article-cover-section'
import { ARTICLE_BODY_MAX, ARTICLE_IMAGE_MAX_BYTES, ARTICLE_IMAGE_TYPES, ARTICLE_SUBTITLE_MAX, ARTICLE_TITLE_MAX, articleEditHref, articleHref } from '@/lib/article-rules'
import { PrepareImageError, prepareImageErrorMessage, prepareUploadImage } from '@/lib/upload-image-client'

type Draft = {
  id?: string | null
  title: string
  subtitle: string
  body: string
  coverPath: string | null
  thumbnailPath?: string | null
  seriesId: string | null
  episodeNo: string
  status?: ArticleCard['status']
  slug?: string
}

export function ArticleEditor({
  initial,
  series,
  canPublish,
}: {
  initial: Draft | null
  series: ArticleSeriesBrief[]
  canPublish: boolean
}) {
  const router = useRouter()
  const [draft, setDraft] = useState<Draft>({
    id: initial?.id ?? null,
    title: initial?.title ?? '',
    subtitle: initial?.subtitle ?? '',
    body: initial?.body ?? '',
    coverPath: initial?.coverPath ?? null,
    thumbnailPath: initial?.thumbnailPath ?? null,
    seriesId: initial?.seriesId ?? null,
    episodeNo: initial?.episodeNo ?? '',
    status: initial?.status ?? 'draft',
    slug: initial?.slug,
  })
  const [preview, setPreview] = useState(false)
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [publishing, setPublishing] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draftRef = useRef(draft)

  const persist = useCallback(async (next = draftRef.current) => {
    if (!next.title.trim()) return next
    setSaving('saving')
    const res = await fetch('/api/articles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: next.id,
        title: next.title.trim(),
        subtitle: next.subtitle.trim() || null,
        body: next.body,
        coverPath: next.coverPath,
        thumbnailPath: next.thumbnailPath ?? null,
        seriesId: next.seriesId,
        episodeNo: next.episodeNo ? Number(next.episodeNo) : null,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setSaving('idle')
      toast.error(data.error || tn('저장하지 못했어요.'))
      return next
    }
    const article = data.article as ArticleCard
    const updated = { ...next, id: article.id, slug: article.slug, status: article.status, coverPath: article.coverPath, thumbnailPath: article.thumbnailPath ?? null }
    setDraft(updated)
    setSaving('saved')
    if (!next.id && article.id) router.replace(articleEditHref(article.slug || article.id))
    return updated
  }, [router])

  useEffect(() => {
    draftRef.current = draft
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { void persist() }, 2000)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [draft, persist])

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }))
    setSaving('idle')
  }

  function wrap(prefix: string, suffix = prefix) {
    const el = document.getElementById('article-body') as HTMLTextAreaElement | null
    if (!el) {
      update('body', draft.body + prefix + suffix)
      return
    }
    const start = el.selectionStart
    const end = el.selectionEnd
    const mid = draft.body.slice(start, end) || ''
    const next = draft.body.slice(0, start) + prefix + mid + suffix + draft.body.slice(end)
    update('body', next.slice(0, ARTICLE_BODY_MAX))
  }

  async function onInlineImage() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        const f = await prepareUploadImage(file, { maxBytes: ARTICLE_IMAGE_MAX_BYTES, maxSide: 2000, allow: ARTICLE_IMAGE_TYPES })
        const form = new FormData()
        form.set('file', f)
        form.set('kind', 'inline')
        const res = await fetch('/api/article-image', { method: 'POST', body: form })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) return toast.error(data.error || tn('이미지를 올리지 못했어요.'))
        wrap(`![${file.name}](${data.url})`, '')
      } catch (e) {
        toast.error(e instanceof PrepareImageError ? prepareImageErrorMessage(e.code, (s) => tn(s)) : tn('이미지를 올리지 못했어요.'))
      }
    }
    input.click()
  }

  async function publish() {
    if (!canPublish) return toast.error(tn('작가 권한이 필요해요.'))
    setPublishing(true)
    const saved = await persist()
    if (!saved.id) {
      setPublishing(false)
      return toast.error(tn('제목과 본문을 채워 주세요.'))
    }
    const res = await fetch(`/api/articles/${saved.id}/publish`, { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    setPublishing(false)
    if (!res.ok) return toast.error(data.error || tn('발행하지 못했어요.'))
    const article = data.article as ArticleCard
    toast.success(tn('발행했어요.'))
    router.push(articleHref(article.slug))
    router.refresh()
  }

  return (
    <div className="article-editor">
      <div className="article-editor-bar">
        <span className="text-sm text-n-888">
          {saving === 'saving' ? <T>저장 중…</T> : saving === 'saved' ? <T>임시 저장됨</T> : draft.status === 'published' ? <T>발행됨</T> : <T>초고</T>}
        </span>
        <div className="flex gap-2">
          <button type="button" className={`btn btn-sm ${preview ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPreview((v) => !v)}>
            <T>미리보기</T>
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void publish()} disabled={publishing || !draft.title.trim() || !draft.body.trim()}>
            <T>발행</T>
          </button>
        </div>
      </div>
      {!canPublish && (
        <p className="article-editor-note"><T>누구나 초고를 쓸 수 있어요. 발행하려면 작가 권한이 필요해요.</T></p>
      )}

      <ArticleCoverSection
        coverPath={draft.coverPath}
        thumbnailPath={draft.thumbnailPath ?? null}
        body={draft.body}
        title={draft.title}
        onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
      />

      <input
        className="article-editor-title"
        value={draft.title}
        onChange={(e) => update('title', e.target.value.slice(0, ARTICLE_TITLE_MAX))}
        placeholder={tx('제목')}
        maxLength={ARTICLE_TITLE_MAX}
        aria-label={tx('제목')}
      />
      <input
        className="article-editor-sub"
        value={draft.subtitle}
        onChange={(e) => update('subtitle', e.target.value.slice(0, ARTICLE_SUBTITLE_MAX))}
        placeholder={tx('부제목 (선택)')}
        maxLength={ARTICLE_SUBTITLE_MAX}
        aria-label={tx('부제목')}
      />

      <div className="article-editor-meta">
        <label className="article-editor-field">
          <span><T>연재</T></span>
          <select className="input" value={draft.seriesId ?? ''} onChange={(e) => update('seriesId', e.target.value || null)} aria-label={tx('연재')}>
            <option value="">{tx('단독 아티클')}</option>
            {series.map((s) => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
        </label>
        {draft.seriesId && (
          <label className="article-editor-field">
            <span><T>화수</T></span>
            <input className="input" type="number" min={1} value={draft.episodeNo} onChange={(e) => update('episodeNo', e.target.value)} aria-label={tx('화수')} />
          </label>
        )}
      </div>

      <div className="article-editor-tools" role="toolbar" aria-label={tx('본문 도구')}>
        <button type="button" onClick={() => wrap('\n\n## ', '\n')} className="btn btn-secondary btn-sm">H2</button>
        <button type="button" onClick={() => wrap('\n- ', '')} className="btn btn-secondary btn-sm"><T>목록</T></button>
        <button type="button" onClick={() => wrap('\n> ', '\n')} className="btn btn-secondary btn-sm"><T>인용</T></button>
        <button type="button" onClick={() => wrap('[', '](https://)')} className="btn btn-secondary btn-sm"><T>링크</T></button>
        <button type="button" onClick={() => void onInlineImage()} className="btn btn-secondary btn-sm"><T>이미지</T></button>
      </div>

      <div className={`article-editor-stage${preview ? ' is-preview' : ''}`}>
        <textarea
          id="article-body"
          className="article-editor-body"
          value={draft.body}
          onChange={(e) => update('body', e.target.value.slice(0, ARTICLE_BODY_MAX))}
          placeholder={tx('본문을 마크다운으로 적어 보세요.')}
          maxLength={ARTICLE_BODY_MAX}
          aria-label={tx('본문')}
        />
        {preview && (
          <div className="article-editor-preview">
            <ArticleMarkdown content={draft.body || tx('미리볼 본문이 없어요.')} />
          </div>
        )}
      </div>
    </div>
  )
}
