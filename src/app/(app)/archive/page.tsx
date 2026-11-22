import Link from 'next/link'
import { ChipBar } from '@/components/chip-bar'
import { redirect } from 'next/navigation'
import { Bookmark, Search } from 'lucide-react'
import { getUserState } from '@/lib/auth'
import { getArchiveItems, listArchive } from '@/lib/data/archive'
import { ARCHIVE_KINDS, ARCHIVE_KIND_LABEL, isArchiveKind } from '@/lib/archive-rules'
import { parsePage, withParams } from '@/lib/paging'
import { Pagination } from '@/components/pagination'
import { ReadingLayout, openHref } from '@/components/reading/reading-layout'
import { EmptyList } from '@/components/reading/compact-row'
import { ArchiveList } from '@/components/archive/archive-list'
import { ArchiveItemView } from '@/components/archive/archive-item-view'
import { AddLinkButton } from '@/components/archive/add-link-button'
import { ArchiveGuide } from '@/components/archive/archive-guide'
import { listApiTokens } from '@/lib/data/tokens'
import { archiveRefLabel } from '@/lib/archive-rules'
import { T } from '@/i18n/t'
import { msg } from '@/i18n/translate'
import { getT } from '@/i18n/server'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('아카이브 · AI쓰발') }
}

/**
 * 아카이브 = my personal stash. Saved with one tap anywhere; filtered by type and
 * tag, searched, paged by number. AI use goes through MCP/CLI only. Owner-only (RLS).
 */
export default async function ArchivePage({ searchParams }: { searchParams: Promise<{ kind?: string; tag?: string; q?: string; page?: string; open?: string }> }) {
  const st = await getT()
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')
  const sp = await searchParams
  const kind = isArchiveKind(sp.kind) ? sp.kind : null
  const tag = sp.tag?.trim().toLowerCase().slice(0, 24) || null
  const q = sp.q?.trim().slice(0, 100) || null
  const page = parsePage(sp.page)
  const open = sp.open && /^[\w-]{1,64}$/.test(sp.open) ? sp.open : null
  const member = state.member
  const base = withParams('/archive', { kind, tag, q, page: page > 1 ? page : null })

  const [data, [openItem], tokens] = await Promise.all([
    listArchive(member.id, { kind, tag, q, page }),
    open ? getArchiveItems(member.id, [open]) : Promise.resolve([]),
    listApiTokens(member.id).catch(() => []),
  ])
  const hasAgent = tokens.some((t) => t.scopes.some((s) => s.startsWith('archive')))
  const exampleRef = archiveRefLabel(data.items[0]?.refNo) ?? 'A12'
  const exampleTag = data.tags[0]?.tag ?? 'mcp'
  const filtered = Boolean(kind || tag || q)
  const chip = (on: boolean) => `filter-chip${on ? ' on' : ''}`

  const list = (
    <>
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold flex items-center gap-2" style={{ color: '#111' }}>
            <Bookmark className="w-6 h-6" />
            <T>아카이브</T>
          </h1>
          <p className="text-[13px] text-[#666] mt-0.5"><T>좋았던 것, 나중에 볼 것을 한곳에 모아 둬요.</T></p>
        </div>
        <AddLinkButton />
      </div>
      <ArchiveGuide hasAgent={hasAgent} exampleRef={exampleRef} exampleTag={exampleTag} />

      <form action="/archive" className="archive-search" role="search">
        <Search className="w-4 h-4 text-[#999] flex-shrink-0" aria-hidden />
        {kind && <input type="hidden" name="kind" value={kind} />}
        {tag && <input type="hidden" name="tag" value={tag} />}
        <input name="q" defaultValue={q ?? ''} placeholder={st('제목·내용·메모 검색 (#A12도 돼요)')} aria-label={st('아카이브 검색')} className="min-w-0 flex-1 bg-transparent outline-none text-[14px]" />
        {q && <Link href={withParams('/archive', { kind, tag })} className="text-xs text-[#888] flex-shrink-0"><T>지우기</T></Link>}
      </form>

      <ChipBar label={st('종류')}>
        <Link href={withParams('/archive', { tag, q })} className={chip(!kind)}>
          <T>전체</T>&nbsp;<span className="opacity-60 tabular-nums">{data.kindCounts.all ?? 0}</span>
        </Link>
        {ARCHIVE_KINDS.filter((k) => data.kindCounts[k] || k === kind).map((k) => (
          <Link key={k} href={withParams('/archive', { kind: k, tag, q })} className={chip(kind === k)}>
            <T>{ARCHIVE_KIND_LABEL[k]}</T>&nbsp;<span className="opacity-60 tabular-nums">{data.kindCounts[k] ?? 0}</span>
          </Link>
        ))}
      </ChipBar>
      {data.tags.length > 0 && (
        <ChipBar label={st('태그')}>
          {data.tags.map((t) => (
            <Link key={t.tag} href={withParams('/archive', { kind, q, tag: tag === t.tag ? null : t.tag })} className={`tag-chip${tag === t.tag ? ' on' : ''}`}>
              #{t.tag}
            </Link>
          ))}
        </ChipBar>
      )}

      {data.items.length === 0 ? (
        <EmptyList
          title={filtered ? st('조건에 맞는 항목이 없어요') : st('아직 담은 게 없어요')}
          hint={filtered ? st('필터를 풀거나 다른 말로 찾아보세요.') : st('글·아고라·툴·모임·프로필의 북마크 버튼이나 ‘링크 담기’로 모아 보세요.')}
        />
      ) : (
        <ArchiveList items={data.items} base={base} openId={openItem?.id ?? null} />
      )}
      <Pagination base={base} page={page} totalPages={data.pages} label={msg('아카이브 페이지')} />
      {data.total > 0 && <p className="text-center text-xs text-[#aaa]"><T s="{n}개 · {page}/{pages} 페이지" vars={{ n: data.total, page, pages: data.pages }} /></p>}
    </>
  )

  return (
    <ReadingLayout
      list={list}
      openId={openItem ? openItem.id : null}
      closeHref={openHref(base, null)}
      paneTitle={st('아카이브')}
      emptyTitle={st('항목을 고르면 여기에서 봐요')}
      pane={openItem ? <ArchiveItemView item={openItem} closeHref={openHref(base, null)} /> : null}
    />
  )
}
