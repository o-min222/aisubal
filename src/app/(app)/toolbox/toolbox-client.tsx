'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Box,
  Download,
  MessageSquareText,
  Plus,
  Search,
  Star,
  Wrench,
} from 'lucide-react'
import type { Member, ToolboxEntry, ToolboxType } from '@/lib/supabase/types'
import {
  TOOLBOX_TYPE_LABEL,
  type ToolboxSort,
} from '@/lib/toolbox-rules'
import { toast } from 'sonner'

interface ToolboxClientProps {
  initialEntries: ToolboxEntry[]
  member: Member
}

const TYPES: { key: ToolboxType | 'all'; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'mcp_server', label: 'MCP' },
  { key: 'agent_skill', label: 'Skills' },
  { key: 'cli_tool', label: 'CLI' },
  { key: 'cursor_rules', label: 'Rules' },
  { key: 'prompt', label: 'Prompt' },
  { key: 'saas_service', label: 'SaaS' },
]

const SORTS: { key: ToolboxSort; label: string }[] = [
  { key: 'trending', label: '트렌딩' },
  { key: 'rated', label: '평점순' },
  { key: 'newest', label: '최신' },
  { key: 'mentions', label: '언급순' },
  { key: 'installs', label: '설치순' },
]

export function ToolboxClient({ initialEntries }: ToolboxClientProps) {
  const [entries, setEntries] = useState(initialEntries)
  const [type, setType] = useState<ToolboxType | 'all'>('all')
  const [sort, setSort] = useState<ToolboxSort>('trending')
  const [q, setQ] = useState('')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [loading, setLoading] = useState(false)

  const tags = useMemo(() => {
    const s = new Set<string>()
    initialEntries.forEach((e) => e.tags.forEach((t) => s.add(t)))
    return Array.from(s).slice(0, 16)
  }, [initialEntries])

  async function reload(next?: {
    type?: ToolboxType | 'all'
    sort?: ToolboxSort
    q?: string
    tag?: string
  }) {
    const t = next?.type ?? type
    const s = next?.sort ?? sort
    const query = next?.q ?? q
    setLoading(true)
    try {
      const params = new URLSearchParams({ sort: s })
      if (t !== 'all') params.set('type', t)
      if (query.trim()) params.set('q', query.trim())
      if (next?.tag) params.set('tag', next.tag)
      const res = await fetch(`/api/toolbox?${params}`)
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || '목록을 불러오지 못했습니다.')
        return
      }
      setEntries(data.entries)
    } catch {
      toast.error('네트워크 오류')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="layout-grid">
      <aside className="hidden lg:block">
        <div className="left-nav">
          <Link href="/toolbox" className="left-nav-item active">
            <Wrench className="w-4 h-4" />
            디렉터리
          </Link>
          <Link href="/toolbox/new" className="left-nav-item">
            <Plus className="w-4 h-4" />
            항목 추가
          </Link>
        </div>
        <div className="sidebar-module mt-4">
          <h3 className="sidebar-title">유형</h3>
          <div className="flex flex-col gap-1">
            {TYPES.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`left-nav-item text-left ${type === t.key ? 'active' : ''}`}
                onClick={() => {
                  setType(t.key)
                  void reload({ type: t.key })
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </aside>

      <div className="space-y-4 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#111]">툴박스</h1>
            <p className="text-sm text-[#666] mt-1">
              스킬·MCP·CLI·서비스를 한곳에서 찾고, 평가하고, 바로 설치하세요.
            </p>
          </div>
          <Link href="/toolbox/new" className="btn btn-primary btn-sm">
            <Plus className="w-4 h-4" />
            항목 추가
          </Link>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#888]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void reload({ q })
              }}
              placeholder="이름, 태그, 한 줄 소개 검색"
              className="w-full h-10 pl-9 pr-3 rounded-lg border border-[#e5e5e5] bg-white text-sm"
            />
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void reload({ q })}
          >
            검색
          </button>
        </div>

        <div className="tab-filters flex-wrap">
          {SORTS.map((s) => (
            <button
              key={s.key}
              type="button"
              className={`tab-filter ${sort === s.key ? 'active' : ''}`}
              onClick={() => {
                setSort(s.key)
                void reload({ sort: s.key })
              }}
            >
              {s.label}
            </button>
          ))}
          <span className="mx-2 text-[#ddd] hidden sm:inline">|</span>
          <button
            type="button"
            className={`tab-filter ${view === 'grid' ? 'active' : ''}`}
            onClick={() => setView('grid')}
          >
            그리드
          </button>
          <button
            type="button"
            className={`tab-filter ${view === 'list' ? 'active' : ''}`}
            onClick={() => setView('list')}
          >
            리스트
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <button
              key={tag}
              type="button"
              className="badge badge-note hover:opacity-80"
              onClick={() => void reload({ tag })}
            >
              #{tag}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-sm text-[#888]">불러오는 중…</p>
        ) : entries.length === 0 ? (
          <div className="card p-8 text-center text-sm text-[#666]">
            조건에 맞는 항목이 없습니다. 직접 추가해 보세요.
          </div>
        ) : view === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {entries.map((e) => (
              <ToolboxCard key={e.id} entry={e} />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map((e) => (
              <ToolboxRow key={e.id} entry={e} />
            ))}
          </div>
        )}
      </div>

      <aside className="hidden lg:block space-y-4">
        <div className="sidebar-module">
          <h3 className="sidebar-title flex items-center gap-2">
            <Box className="w-4 h-4" />
            한눈에
          </h3>
          <p className="text-sm text-[#666]">
            게시물에 GitHub/MCP URL이 있으면 디렉터리에 자동 반영되고 언급 수가
            올라갑니다. 설치 전 소스·라이선스를 확인하세요.
          </p>
        </div>
      </aside>
    </div>
  )
}

function ToolboxCard({ entry }: { entry: ToolboxEntry }) {
  return (
    <Link href={`/toolbox/${entry.slug}`} className="feed-item block h-full">
      <div className="flex gap-3">
        <ToolIcon name={entry.name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="badge badge-mcp">{TOOLBOX_TYPE_LABEL[entry.type]}</span>
            {entry.featured && <span className="badge badge-agent">추천</span>}
          </div>
          <h3 className="feed-item-title">{entry.name}</h3>
          <p className="feed-item-desc line-clamp-2">{entry.one_liner}</p>
          <div className="feed-item-meta mt-3 flex-wrap">
            <span className="inline-flex items-center gap-1">
              <Star className="w-3.5 h-3.5 fill-[#f5a623] text-[#f5a623]" />
              {entry.avg_rating.toFixed(1)}
              <span className="text-[#aaa]">({entry.rating_count})</span>
            </span>
            <span>·</span>
            <span className="inline-flex items-center gap-1">
              <MessageSquareText className="w-3.5 h-3.5" />
              {entry.mention_count}
            </span>
            <span>·</span>
            <span className="inline-flex items-center gap-1">
              <Download className="w-3.5 h-3.5" />
              {entry.install_count}
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}

function ToolboxRow({ entry }: { entry: ToolboxEntry }) {
  return (
    <Link href={`/toolbox/${entry.slug}`} className="feed-item flex items-center gap-3">
      <ToolIcon name={entry.name} dim="w-10 h-10" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-[#111] truncate">{entry.name}</h3>
          <span className="badge badge-mcp">{TOOLBOX_TYPE_LABEL[entry.type]}</span>
        </div>
        <p className="text-sm text-[#666] truncate">{entry.one_liner}</p>
      </div>
      <div className="hidden sm:flex items-center gap-4 text-sm text-[#888] flex-shrink-0">
        <span className="inline-flex items-center gap-1">
          <Star className="w-3.5 h-3.5 fill-[#f5a623] text-[#f5a623]" />
          {entry.avg_rating.toFixed(1)}
        </span>
        <span>언급 {entry.mention_count}</span>
        <span>설치 {entry.install_count}</span>
      </div>
    </Link>
  )
}

function ToolIcon({ name, dim = 'w-12 h-12' }: { name: string; dim?: string }) {
  return (
    <div
      className={`product-icon ${dim} text-base flex-shrink-0`}
      aria-hidden
    >
      {name.charAt(0).toUpperCase()}
    </div>
  )
}
