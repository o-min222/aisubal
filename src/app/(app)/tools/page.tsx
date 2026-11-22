import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Inbox, Rocket, Send } from 'lucide-react'
import { getUserState } from '@/lib/auth'
import { listTools, socialToolUsers } from '@/lib/data/tools'
import {
  TOOL_CATEGORIES,
  TOOL_SORTS,
  categoryFromLegacyType,
  parseToolSort,
  topTags,
  type ToolCategory,
  type ToolSort,
} from '@/lib/tool-rules'
import { LinkTabs } from '@/components/link-tabs'
import { Pagination } from '@/components/pagination'
import { PAGE_SIZE, parsePage } from '@/lib/paging'
import { ReadingLayout, openHref } from '@/components/reading/reading-layout'
import { CompactList, EmptyList } from '@/components/reading/compact-row'
import { ToolRow } from '@/components/reading/tool-row'
import { loadToolEntry, ToolDetailView } from '@/components/detail/tool-detail-view'
import { ToolSearch } from '@/components/tools/tool-search'

export const metadata = { title: '툴 · AI쓰발' }

type Params = { category?: string; type?: string; tag?: string; q?: string; sort?: string; mine?: string; page?: string; open?: string }

function hrefWith(base: Params, patch: Partial<Record<keyof Params, string | null>>) {
  const next: Record<string, string> = {}
  for (const [k, v] of Object.entries({ ...base, ...patch })) if (v) next[k] = v
  delete next.type
  delete next.open
  if (next.page === '1') delete next.page
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
  const page = parsePage(sp.page)
  const base: Params = { category: category ?? undefined, tag: tag ?? undefined, q: q || undefined, sort, mine: mine ? '1' : undefined }
  // tabs/filters reset the page; the current list URL keeps it
  const here = hrefWith({ ...base, page: String(page) }, {})
  const open = sp.open ? decodeURIComponent(sp.open).slice(0, 120) : null

  const [all, forTags, openEntry] = await Promise.all([
    listTools(state.member.id, { category, tag, q, sort, mine }),
    listTools(state.member.id, { category }),
    open ? loadToolEntry(open).catch(() => null) : Promise.resolve(null),
  ])
  const totalPages = Math.max(1, Math.ceil(all.length / PAGE_SIZE))
  const tools = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const tags = topTags(forTags, 14)
  const social = await socialToolUsers(state.member.id, tools.map((t) => t.id)).catch(() => new Map())
  const tab = mine ? 'mine' : category ?? 'all'

  const list = (
    <>
      <header className="tools-head">
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold text-[#111]">툴</h1>
          <p className="text-[13px] text-[#666] mt-0.5">MCP·스킬·프롬프트·CLI부터 멤버가 만든 프로덕트까지 한곳에서.</p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Link href="/tools/launch" className="btn btn-secondary btn-sm min-h-[40px]">
            <Rocket className="w-4 h-4" /> <span className="only-desktop">런치</span>
          </Link>
          <Link href="/tools/submissions" className="btn btn-secondary btn-sm min-h-[40px]" aria-label="내 등록 요청">
            <Inbox className="w-4 h-4" /> <span className="only-desktop">내 요청</span>
          </Link>
          <Link href="/tools/new" className="btn btn-primary btn-sm min-h-[40px]">
            <Send className="w-4 h-4" /> 등록 요청
          </Link>
        </div>
      </header>

      <div className="anon-toolbar space-y-2">
        <ToolSearch key={q} initial={q} />
        <div className="card" style={{ padding: '0 8px' }}>
          <LinkTabs
            label="카테고리"
            active={tab}
            tabs={[
              { id: 'all', label: '전체', href: hrefWith(base, { category: null, mine: null, tag: null }) },
              { id: 'mine', label: '내가 쓰는 툴', href: hrefWith(base, { category: null, mine: '1', tag: null }) },
              ...TOOL_CATEGORIES.map((c) => ({ id: c.id, label: c.label, href: hrefWith(base, { category: c.id, mine: null, tag: null }) })),
            ]}
          />
        </div>
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
          <span className="text-xs text-[#888] tabular-nums">{all.length}개</span>
        </div>
      </div>

      {tools.length === 0 ? (
        <EmptyList
          title={mine ? '아직 ‘나도 써요’로 표시한 툴이 없어요' : '조건에 맞는 툴이 없어요'}
          hint={mine ? '툴을 열고 ‘나도 써요’를 눌러 내 프로필에 모아보세요.' : '필터를 바꾸거나, 내 AI에게 등록 요청을 맡겨보세요.'}
        />
      ) : (
        <CompactList label="툴 목록">
          {tools.map((t) => (
            <ToolRow key={t.id} tool={t} href={openHref(here, t.slug)} active={Boolean(openEntry && openEntry.id === t.id)} social={social.get(t.id) || []} />
          ))}
        </CompactList>
      )}
      <Pagination base={here} page={page} totalPages={totalPages} label="툴 페이지" />
    </>
  )

  return (
    <ReadingLayout
      list={list}
      openId={openEntry ? open : null}
      closeHref={here}
      fullHref={openEntry ? `/tools/${openEntry.slug}` : null}
      paneTitle={openEntry ? openEntry.name : '툴'}
      emptyTitle="툴을 고르면 여기에서 자세히 봐요"
      pane={openEntry ? <ToolDetailView entry={openEntry} member={state.member} variant="pane" /> : null}
    />
  )
}
