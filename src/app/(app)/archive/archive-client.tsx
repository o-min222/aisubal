'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Bookmark,
  Brain,
  Copy,
  Download,
  FolderPlus,
  Highlighter,
  Search,
  Share2,
  Sparkles,
  Trash2,
} from 'lucide-react'
import type { ArchiveCollection, ArchiveSourceType, Member } from '@/lib/supabase/types'
import { ARCHIVE_SOURCE_LABEL } from '@/lib/archive-brain-rules'
import { RelativeTime } from '@/components/relative-time'
import { toast } from 'sonner'
import { T } from '@/i18n/t'
import { tx, tn } from '@/i18n/client'
import { msg } from '@/i18n/translate'

type BrainRow = {
  id: string
  source_type: ArchiveSourceType
  title: string
  summary: string | null
  content_text: string
  source_url: string | null
  extracted_text: string | null
  tags: string[]
  note: string | null
  collection_ids: string[]
  updated_at: string
  type_label?: string
  highlights?: { id: string; quote: string; note: string | null }[]
}

interface ArchiveClientProps {
  member: Member
  initialItems?: BrainRow[]
  initialCollections?: (ArchiveCollection & { item_count?: number })[]
}

const TYPE_TABS: { key: ArchiveSourceType | 'all'; label: string }[] = [
  { key: 'all', label: msg('전체') },
  { key: 'post', label: msg('게시물') },
  { key: 'link', label: msg('링크') },
  { key: 'asset', label: msg('에셋') },
  { key: 'toolbox', label: msg('툴박스') },
  { key: 'meetup', label: msg('모임') },
  { key: 'product', label: msg('프로덕트') },
]

export function ArchiveClient({
  member,
  initialItems = [],
  initialCollections = [],
}: ArchiveClientProps) {
  const [items, setItems] = useState<BrainRow[]>(initialItems)
  const [collections, setCollections] = useState<(ArchiveCollection & { item_count?: number })[]>(
    initialCollections
  )
  const [q, setQ] = useState('')
  const [type, setType] = useState<ArchiveSourceType | 'all'>('all')
  const [tag, setTag] = useState<string | null>(null)
  const [collectionId, setCollectionId] = useState<string | null>(null)
  const [selected, setSelected] = useState<BrainRow | null>(null)
  const [loading, setLoading] = useState(false)
  const [newColName, setNewColName] = useState('')
  const [hlQuote, setHlQuote] = useState('')

  async function reload(opts?: {
    q?: string
    type?: ArchiveSourceType | 'all'
    tag?: string | null
    collection?: string | null
  }) {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      const qq = opts?.q ?? q
      const tt = opts?.type ?? type
      const tg = opts?.tag === undefined ? tag : opts.tag
      const col = opts?.collection === undefined ? collectionId : opts.collection
      if (qq.trim()) params.set('q', qq.trim())
      if (tt !== 'all') params.set('type', tt)
      if (tg) params.set('tag', tg)
      if (col) params.set('collection', col)
      const res = await fetch(`/api/archive?${params}`)
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || tn('불러오기 실패'))
        return
      }
      setItems(data.items || [])
      setCollections(data.collections || [])
    } catch {
      toast.error(tn('네트워크 오류'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Keep SSR seeds; only refresh if empty (e.g. stale client)
    if (initialItems.length === 0) void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const allTags = useMemo(() => {
    const s = new Set<string>()
    items.forEach((i) => i.tags.forEach((t) => s.add(t)))
    return Array.from(s)
  }, [items])

  async function removeItem(id: string) {
    const res = await fetch(`/api/archive/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      toast.error(tn('삭제 실패'))
      return
    }
    toast.success(tn('삭제했습니다.'))
    if (selected?.id === id) setSelected(null)
    void reload()
  }

  async function useInAi(itemId: string) {
    const res = await fetch(`/api/archive/${itemId}`)
    const data = await res.json()
    if (!res.ok) {
      toast.error(data.error || tn('실패'))
      return
    }
    const text = data.use_in_ai?.prompt || ''
    try {
      await navigator.clipboard.writeText(text)
      toast.success(tn('AI용 프롬프트+컨텍스트를 복사했습니다.'))
    } catch {
      toast.error(tn('복사 실패'))
    }
  }

  async function useCollectionInAi(colId: string) {
    const res = await fetch(`/api/archive/collections?id=${colId}`)
    const data = await res.json()
    if (!res.ok) {
      toast.error(data.error || tn('실패'))
      return
    }
    try {
      await navigator.clipboard.writeText(data.use_in_ai?.prompt || '')
      toast.success(tn('컬렉션 컨텍스트 복사 · {ref}', { ref: data.use_in_ai?.reference ?? '' }))
    } catch {
      toast.error(tn('복사 실패'))
    }
  }

  async function exportCollection(colId: string) {
    window.open(`/api/archive/export?collection=${colId}&format=pack&json=1`, '_blank')
    toast.success(tn('컨텍스트 팩 JSON을 열었습니다. CLI: aisubal archive pull ') + colId)
  }

  async function createCollection() {
    if (!newColName.trim()) return
    const res = await fetch('/api/archive/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newColName.trim(), is_shared: false }),
    })
    const data = await res.json()
    if (!res.ok) {
      toast.error(data.error || tn('생성 실패'))
      return
    }
    setNewColName('')
    toast.success(tn('컬렉션 생성'))
    void reload()
  }

  async function addHighlight() {
    if (!selected || !hlQuote.trim()) return
    const res = await fetch(`/api/archive/${selected.id}/highlights`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quote: hlQuote.trim() }),
    })
    if (!res.ok) {
      toast.error(tn('하이라이트 실패'))
      return
    }
    setHlQuote('')
    toast.success(tn('하이라이트 추가'))
    const detail = await fetch(`/api/archive/${selected.id}`).then((r) => r.json())
    setSelected({ ...detail.item, highlights: detail.highlights })
    void reload()
  }

  return (
    <div className="layout-grid">
      <aside className="hidden lg:block space-y-4">
        <div className="left-nav">
          <button
            type="button"
            className={`left-nav-item ${!collectionId ? 'active' : ''}`}
            onClick={() => {
              setCollectionId(null)
              void reload({ collection: null })
            }}
          >
            <Brain className="w-4 h-4" />
            <T>전체 브레인</T>
          </button>
        </div>
        <div className="sidebar-module">
          <h3 className="sidebar-title"><T>컬렉션</T></h3>
          <div className="space-y-1">
            {collections.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`left-nav-item w-full text-left ${
                  collectionId === c.id ? 'active' : ''
                }`}
                onClick={() => {
                  setCollectionId(c.id)
                  void reload({ collection: c.id })
                }}
              >
                <span className="truncate flex-1">{c.name}</span>
                {c.is_shared && <Share2 className="w-3 h-3 text-[#888]" />}
              </button>
            ))}
          </div>
          <div className="mt-3 flex gap-1">
            <input
              value={newColName}
              onChange={(e) => setNewColName(e.target.value)}
              placeholder={tx('새 컬렉션')}
              className="input text-sm flex-1 h-8"
            />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void createCollection()}>
              <FolderPlus className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="space-y-4 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#111] flex items-center gap-2">
              <Brain className="w-6 h-6" />
              <T>세컨드 브레인</T>
            </h1>
            <p className="text-sm text-[#666] mt-1">
              <T>게시물·링크·툴·모임·프로덕트를 모아 내 AI에 연결합니다. 기본은 비공개</T> · {member.display_name}
            </p>
          </div>
          <div className="flex gap-2">
            {collectionId && (
              <>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => void useCollectionInAi(collectionId)}
                >
                  <Sparkles className="w-4 h-4" />
                  Use in my AI
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => void exportCollection(collectionId)}
                >
                  <Download className="w-4 h-4" />
                  <T>팩보내기</T>
                </button>
              </>
            )}
            <a href="/api/archive/export" className="btn btn-secondary btn-sm">
              <Download className="w-4 h-4" />
              <T>전체보내기</T>
            </a>
          </div>
        </div>

        <div className="card p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#888]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void reload({ q })}
              placeholder={tx('전문 검색 (제목·본문·추출문·노트·태그)')}
              className="input pl-10"
            />
          </div>
          <div className="tab-filters mt-3 flex-wrap">
            {TYPE_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`tab-filter ${type === t.key ? 'active' : ''}`}
                onClick={() => {
                  setType(t.key)
                  void reload({ type: t.key })
                }}
              >
                <T>{t.label}</T>
              </button>
            ))}
          </div>
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-[#eee]">
              <button
                type="button"
                onClick={() => {
                  setTag(null)
                  void reload({ tag: null })
                }}
                className={`text-xs px-3 py-1.5 rounded-full ${
                  !tag ? 'bg-[#111] text-white' : 'bg-[#f0f0f0] text-[#666]'
                }`}
              >
                <T>전체 태그</T>
              </button>
              {allTags.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setTag(t)
                    void reload({ tag: t })
                  }}
                  className={`text-xs px-3 py-1.5 rounded-full ${
                    tag === t ? 'bg-[#111] text-white' : 'bg-[#f0f0f0] text-[#666]'
                  }`}
                >
                  #{t}
                </button>
              ))}
            </div>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-[#888]"><T>불러오는 중…</T></p>
        ) : items.length === 0 ? (
          <div className="card p-10 text-center text-sm text-[#666]">
            <Bookmark className="w-8 h-8 mx-auto mb-2 text-[#ccc]" />
            <T>저장된 항목이 없습니다. 피드·툴박스·모임에서 저장해 보세요.</T>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <article
                key={item.id}
                className={`feed-item cursor-pointer ${
                  selected?.id === item.id ? 'border-[#111]' : ''
                }`}
                onClick={() => setSelected(item)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-2 mb-1">
                      <span className="badge badge-note">
                        <T>{ARCHIVE_SOURCE_LABEL[item.source_type]}</T>
                      </span>
                      {item.tags.slice(0, 4).map((t) => (
                        <span key={t} className="badge badge-mcp">
                          #{t}
                        </span>
                      ))}
                    </div>
                    <h3 className="feed-item-title">{item.title}</h3>
                    {item.summary && (
                      <p className="feed-item-desc line-clamp-2">{item.summary}</p>
                    )}
                    {item.note && (
                      <p className="text-xs text-[#666] mt-2"><T>노트:</T> {item.note}</p>
                    )}
                    <div className="feed-item-meta">
                      <RelativeTime date={item.updated_at} />
                      {item.highlights && item.highlights.length > 0 && (
                        <>
                          <span>·</span>
                          <span className="inline-flex items-center gap-1">
                            <Highlighter className="w-3.5 h-3.5" />
                            {item.highlights.length}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => void useInAi(item.id)}
                    >
                      <Sparkles className="w-4 h-4" />
                      AI
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => void removeItem(item.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <aside className="hidden lg:block">
        {selected ? (
          <div className="sidebar-module space-y-3 sticky top-20">
            <h3 className="sidebar-title">{selected.title}</h3>
            <p className="text-xs text-[#888] font-mono">aisubal://archive/{selected.id}</p>
            {selected.source_url && (
              <a
                href={selected.source_url}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-[#0066cc] break-all"
              >
                {selected.source_url}
              </a>
            )}
            {selected.extracted_text && (
              <div>
                <p className="text-xs font-medium text-[#666] mb-1"><T>추출문 / 트랜스크립트</T></p>
                <pre className="text-xs bg-[#f5f5f5] p-2 rounded max-h-40 overflow-auto whitespace-pre-wrap">
                  {selected.extracted_text.slice(0, 800)}
                </pre>
              </div>
            )}
            <button
              type="button"
              className="btn btn-primary btn-sm w-full"
              onClick={() => void useInAi(selected.id)}
            >
              <Copy className="w-4 h-4" />
              Use in my AI
            </button>
            <div>
              <p className="text-xs font-medium text-[#666] mb-1"><T>하이라이트</T></p>
              <ul className="space-y-1 mb-2">
                {(selected.highlights || []).map((h) => (
                  <li key={h.id} className="text-xs text-[#444]">
                    “{h.quote}”
                  </li>
                ))}
              </ul>
              <textarea
                value={hlQuote}
                onChange={(e) => setHlQuote(e.target.value)}
                placeholder={tx('인용 추가')}
                className="w-full text-xs border border-[#e5e5e5] rounded p-2 min-h-[60px]"
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm mt-1 w-full"
                onClick={() => void addHighlight()}
              >
                <Highlighter className="w-3.5 h-3.5" />
                <T>추가</T>
              </button>
            </div>
            <Link href={`/archive`} className="text-xs text-[#888]">
              <T>상세는 선택 후 AI 버튼으로 전체 컨텍스트를 복사하세요.</T>
            </Link>
          </div>
        ) : (
          <div className="sidebar-module text-sm text-[#666]">
            <T>항목을 선택하면 추출문·하이라이트·AI 복사를 쓸 수 있습니다. 아카이브는 기본 비공개이며, 컬렉션만 선택적으로 멤버 공유할 수 있습니다.</T>
          </div>
        )}
      </aside>
    </div>
  )
}
