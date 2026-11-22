'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Bot, Building2, CalendarDays, Link2, MessageSquare, Sparkles, Trash2, User, Users, VenetianMask, Wrench, X } from 'lucide-react'
import { toast } from 'sonner'
import { T } from '@/i18n/t'
import { tn, tx } from '@/i18n/client'
import { RelativeTime } from '@/components/relative-time'
import { ARCHIVE_KIND_LABEL, type ArchiveItem, type ArchiveKind } from '@/lib/archive-rules'
import { InjectSheet } from './inject-sheet'

export const KIND_ICON: Record<ArchiveKind, typeof Link2> = {
  post: MessageSquare,
  agora: Bot,
  tool: Wrench,
  anon: VenetianMask,
  group: Users,
  moim: CalendarDays,
  member: User,
  link: Link2,
}
const hostOf = (u: string | null) => {
  try {
    return u && /^https?:/.test(u) ? new URL(u).hostname.replace(/^www\./, '') : null
  } catch {
    return null
  }
}
const withOpen = (base: string, id: string) => {
  const [p, qs = ''] = base.split('?')
  const s = new URLSearchParams(qs)
  s.set('open', id)
  return `${p}?${s}`
}

/** Archive rows with multi-select; the selection bar injects into AI or deletes. */
export function ArchiveList({ items, base, openId }: { items: ArchiveItem[]; base: string; openId: string | null }) {
  const router = useRouter()
  const [sel, setSel] = useState<string[]>([])
  const [inject, setInject] = useState<string[] | null>(null)
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const allOn = sel.length === items.length && items.length > 0

  async function removeSel() {
    if (!confirm(tn('선택한 {n}개를 아카이브에서 뺄까요?', { n: sel.length }))) return
    const res = await fetch('/api/archive/batch', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: sel }) })
    if (!res.ok) return toast.error(tn('네트워크 오류'))
    toast(tn('{n}개를 뺐어요', { n: sel.length }))
    setSel([])
    router.refresh()
  }

  return (
    <>
      <div className="archive-selbar" data-active={sel.length > 0 || undefined}>
        <label className="inline-flex items-center gap-2 text-[13px] text-[#555] cursor-pointer select-none">
          <input type="checkbox" className="archive-check" checked={allOn} onChange={() => setSel(allOn ? [] : items.map((i) => i.id))} aria-label={tx('이 페이지 전체 선택')} />
          {sel.length ? <T s="{n}개 선택" vars={{ n: sel.length }} /> : <T>선택</T>}
        </label>
        {sel.length > 0 && (
          <div className="flex items-center gap-1.5 ml-auto">
            <button type="button" className="archive-act primary" onClick={() => setInject(sel)}>
              <Sparkles className="w-4 h-4" /> <T>내 AI에 넣기</T>
            </button>
            <button type="button" className="archive-act" onClick={() => void removeSel()} aria-label={tx('선택 삭제')} title={tx('선택 삭제')}>
              <Trash2 className="w-4 h-4" />
            </button>
            <button type="button" className="archive-act" onClick={() => setSel([])} aria-label={tx('선택 해제')} title={tx('선택 해제')}>
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
      <div className="crow-list" role="list" aria-label={tx('아카이브 항목')}>
        {items.map((it) => {
          const Icon = it.kind === 'link' && it.authorKind === 'site' ? (hostOf(it.sourceUrl) ? Link2 : Building2) : KIND_ICON[it.kind]
          const on = sel.includes(it.id)
          return (
            <div key={it.id} role="listitem" className={`archive-row${on ? ' sel' : ''}`}>
              <input type="checkbox" className="archive-check" checked={on} onChange={() => toggle(it.id)} aria-label={tx('{title} 선택', { title: it.title })} />
              <Link href={withOpen(base, it.id)} scroll={false} className={`crow${openId === it.id ? ' on' : ''}`} aria-current={openId === it.id ? 'true' : undefined}>
                <span className="crow-lead archive-kind" aria-hidden>
                  <Icon className="w-4 h-4" />
                </span>
                <span className="crow-main">
                  <span className="crow-top">
                    <span className="crow-title">{it.title}</span>
                  </span>
                  {(it.memo || it.excerpt) && <span className="crow-preview">{it.memo ? `📝 ${it.memo}` : it.excerpt}</span>}
                  <span className="crow-meta">
                    <T>{ARCHIVE_KIND_LABEL[it.kind]}</T>
                    {it.kind === 'link' ? hostOf(it.sourceUrl) && <> · {hostOf(it.sourceUrl)}</> : it.authorKind === 'anon' ? <> · <T>익명</T></> : it.authorLabel && <> · {it.authorLabel}</>}
                    {' · '}
                    <RelativeTime date={it.createdAt} />
                    {it.tags.slice(0, 3).map((t) => (
                      <span key={t} className="archive-tag">#{t}</span>
                    ))}
                  </span>
                </span>
              </Link>
            </div>
          )
        })}
      </div>
      <InjectSheet ids={inject} onClose={() => setInject(null)} />
    </>
  )
}
