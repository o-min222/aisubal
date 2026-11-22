'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ExternalLink, Sparkles, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { T } from '@/i18n/t'
import { tn, tx } from '@/i18n/client'
import { KstDate } from '@/components/kst-date'
import { ARCHIVE_KIND_LABEL, ARCHIVE_MEMO_MAX, cleanTags, type ArchiveItem } from '@/lib/archive-rules'
import { KIND_ICON } from './archive-list'
import { InjectSheet } from './inject-sheet'

/** Reading-pane detail: source, excerpt (third-party), my memo + tags (autosaved), inject / open / delete. */
export function ArchiveItemView({ item, closeHref }: { item: ArchiveItem; closeHref: string }) {
  const router = useRouter()
  const [memo, setMemo] = useState(item.memo)
  const [tags, setTags] = useState(item.tags.map((t) => `#${t}`).join(' '))
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [inject, setInject] = useState<string[] | null>(null)
  const Icon = KIND_ICON[item.kind]
  const external = item.sourceUrl && /^https?:/.test(item.sourceUrl)

  async function persist() {
    const next = { memo, tags: cleanTags(tags) }
    if (next.memo === item.memo && next.tags.join() === item.tags.join()) return
    setSaved('saving')
    const r = await fetch(`/api/archive/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) })
    if (!r.ok) {
      setSaved('idle')
      return toast.error(tn('저장 실패'))
    }
    setTags(next.tags.map((t) => `#${t}`).join(' '))
    setSaved('saved')
    router.refresh()
  }

  async function remove() {
    if (!confirm(tn('아카이브에서 뺄까요?'))) return
    const r = await fetch(`/api/archive/${item.id}`, { method: 'DELETE' })
    if (!r.ok) return toast.error(tn('네트워크 오류'))
    toast(tn('아카이브에서 뺐어요'))
    router.push(closeHref, { scroll: false })
    router.refresh()
  }

  return (
    <article className="space-y-4 min-w-0">
      <header className="space-y-1.5">
        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#777]">
          <Icon className="w-3.5 h-3.5" /> <T>{ARCHIVE_KIND_LABEL[item.kind]}</T>
          {item.authorKind === 'anon' ? <> · <T>익명</T></> : item.authorLabel && <> · {item.authorLabel}</>}
        </span>
        <h2 className="text-[19px] font-bold leading-snug break-words" style={{ color: '#111' }}>{item.title}</h2>
        <p className="text-[12px] text-[#999]">
          <T s="{date} 저장" vars={{ date: <KstDate iso={item.createdAt} /> }} />
        </p>
      </header>

      {item.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="rounded-xl border border-[#eee] max-h-[220px] w-full object-cover" />
      )}

      {item.excerpt && (
        <section className="archive-excerpt">
          <p className="archive-excerpt-label"><T>저장된 내용</T></p>
          <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed text-[#333]">{item.excerpt}</p>
        </section>
      )}

      <section className="space-y-2">
        <label className="block">
          <span className="flex items-center justify-between text-xs text-[#777]">
            <T>내 메모</T>
            <span className="text-[11px] text-[#aaa]" aria-live="polite">{saved === 'saving' ? <T>저장 중…</T> : saved === 'saved' ? <T>저장됨</T> : null}</span>
          </span>
          <textarea value={memo} maxLength={ARCHIVE_MEMO_MAX} rows={2} onChange={(e) => (setMemo(e.target.value), setSaved('idle'))} onBlur={() => void persist()} placeholder={tx('왜 담았는지 한 줄로')} className="archive-input mt-1" />
        </label>
        <label className="block">
          <span className="text-xs text-[#777]"><T>태그</T></span>
          <input value={tags} onChange={(e) => (setTags(e.target.value), setSaved('idle'))} onBlur={() => void persist()} onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()} placeholder="#mcp #나중에" className="archive-input mt-1" />
        </label>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-primary btn-sm inline-flex items-center gap-1.5" onClick={() => setInject([item.id])}>
          <Sparkles className="w-4 h-4" /> <T>내 AI에 넣기</T>
        </button>
        {item.sourceUrl &&
          (external ? (
            <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="btn btn-secondary btn-sm inline-flex items-center gap-1.5">
              <ExternalLink className="w-4 h-4" /> <T>원문 열기</T>
            </a>
          ) : (
            <Link href={item.sourceUrl} className="btn btn-secondary btn-sm inline-flex items-center gap-1.5">
              <ExternalLink className="w-4 h-4" /> <T>원문 열기</T>
            </Link>
          ))}
        <button type="button" className="btn btn-ghost btn-sm inline-flex items-center gap-1.5 text-[#c0392b] ml-auto" onClick={() => void remove()}>
          <Trash2 className="w-4 h-4" /> <T>빼기</T>
        </button>
      </div>
      <InjectSheet ids={inject} onClose={() => setInject(null)} />
    </article>
  )
}
