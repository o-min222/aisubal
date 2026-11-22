import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus, Rocket } from 'lucide-react'
import { getUserState } from '@/lib/auth'
import { listTools } from '@/lib/data/tools'
import {
  TOOL_CATEGORIES,
  TOOL_SORTS,
  categoryFromLegacyType,
  parseToolSort,
  topTags,
  type ToolCategory,
  type ToolSort,
} from '@/lib/tool-rules'
import { ToolCard } from '@/components/tools/tool-card'
import { ToolSearch } from '@/components/tools/tool-search'

export const metadata = { title: '툴 · AI쓰발' }

type Params = { category?: string; type?: string; tag?: string; q?: string; sort?: string; mine?: string }

function hrefWith(base: Params, patch: Partial<Record<keyof Params, string | null>>) {
  const next: Record<string, string> = {}
  for (const [k, v] of Object.entries({ ...base, ...patch })) if (v) next[k] = v
  delete next.type
  if (next.sort === 'popular') delete next.sort
  const s = new URLSearchParams(next).toString()
  return s ? `/tools?${s}` : '/tools'
}

export default async function ToolsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')

  const sp = await searchParams
  const category: ToolCategory | null = categoryFromLegacyType(sp.category || sp.type)
  const sort: ToolSort = parseToolSort(sp.sort)
  const mine = sp.mine === '1'
  const tag = sp.tag?.toLowerCase() || null
  const q = sp.q || ''
  const base: Params = { category: category ?? undefined, tag: tag ?? undefined, q: q || undefined, sort, mine: mine ? '1' : undefined }

  const [tools, forTags] = await Promise.all([
    listTools(state.member.id, { category, tag, q, sort, mine }),
    listTools(state.member.id, { category }),
  ])
  const tags = topTags(forTags, 14)

  return (
    <div className="space-y-3">
      <header className="tools-head">
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold text-[#111]">툴</h1>
          <p className="text-[13px] text-[#666] mt-0.5">MCP·스킬·프롬프트·CLI부터 멤버가 만든 프로덕트까지 한곳에서.</p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Link href="/tools/launch" className="btn btn-secondary btn-sm min-h-[40px]">
            <Rocket className="w-4 h-4" /> <span className="only-desktop">런치</span>
          </Link>
          <Link href="/tools/new" className="btn btn-primary btn-sm min-h-[40px]">
            <Plus className="w-4 h-4" /> 툴 추가
          </Link>
        </div>
      </header>

      <div className="anon-toolbar space-y-2">
        <ToolSearch key={q} initial={q} />
        <nav className="chip-row" aria-label="카테고리">
          <Link href={hrefWith(base, { category: null, mine: null })} className={`filter-chip ${!category && !mine ? 'on' : ''}`}>
            전체
          </Link>
          <Link href={hrefWith(base, { mine: mine ? null : '1' })} className={`filter-chip ${mine ? 'on' : ''}`} aria-pressed={mine}>
            내가 쓰는 툴
          </Link>
          {TOOL_CATEGORIES.map((c) => (
            <Link
              key={c.id}
              href={hrefWith(base, { category: category === c.id ? null : c.id })}
              className={`filter-chip ${category === c.id ? 'on' : ''}`}
              aria-current={category === c.id ? 'page' : undefined}
            >
              {c.label}
            </Link>
          ))}
        </nav>
        {tags.length > 0 && (
          <nav className="chip-row" aria-label="태그">
            {tags.map((t) => (
              <Link
                key={t}
                href={hrefWith(base, { tag: tag === t ? null : t })}
                className={`tag-chip ${tag === t ? 'on' : ''}`}
              >
                #{t}
              </Link>
            ))}
          </nav>
        )}
        <div className="flex items-center justify-between gap-2">
          <div className="seg" role="tablist" aria-label="정렬">
            {TOOL_SORTS.map((s) => (
              <Link
                key={s.id}
                href={hrefWith(base, { sort: s.id })}
                role="tab"
                aria-selected={sort === s.id}
                className={sort === s.id ? 'on seg-link' : 'seg-link'}
              >
                {s.label}
              </Link>
            ))}
          </div>
          <span className="text-xs text-[#888] tabular-nums">{tools.length}개</span>
        </div>
      </div>

      {tools.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="font-medium text-[#333]">{mine ? '아직 사용 중으로 표시한 툴이 없어요' : '조건에 맞는 툴이 없어요'}</p>
          <p className="text-sm text-[#888] mt-1">
            {mine ? '툴 옆의 ‘사용 중 표시’를 눌러 내 프로필에 모아보세요.' : '필터를 바꾸거나 직접 추가해보세요.'}
          </p>
        </div>
      ) : (
        <div className="tool-list">
          {tools.map((t) => (
            <ToolCard key={t.id} tool={t} />
          ))}
        </div>
      )}
    </div>
  )
}
