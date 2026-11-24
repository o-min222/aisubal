import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { search, type SearchHit } from '@/lib/data/search'
import { SEARCH_TABS, cleanQuery, parseSearchTab, type SearchTab } from '@/lib/search-rules'
import { ChipBar } from '@/components/chip-bar'
import { CompactList, CompactRow, EmptyList } from '@/components/reading/compact-row'
import { UserAvatar } from '@/components/user-avatar'
import { T } from '@/i18n/t'
import { getT } from '@/i18n/server'
import { msg } from '@/i18n/translate'

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const t = await getT()
  const q = cleanQuery((await searchParams).q)
  return { title: q ? t('‘{q}’ 검색 · AI쓰발', { q }) : t('검색 · AI쓰발') }
}

const SECTION: Record<Exclude<SearchTab, 'all'>, string> = {
  people: msg('사람'),
  feed: msg('피드'),
  agora: msg('아고라'),
  gallery: msg('갤러리'),
}

/** Full results for the top-bar search. Same sources and visibility rules as the quick dialog. */
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; tab?: string }> }) {
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/')
  if (state.type === 'waitlist') redirect('/waitlist')
  const st = await getT()
  const sp = await searchParams
  const q = cleanQuery(sp.q)
  const tab = parseSearchTab(sp.tab)
  const res = q ? await search(state.member.id, q, tab === 'all' ? 5 : 30) : null
  const href = (id: SearchTab) => `/search?q=${encodeURIComponent(q ?? '')}${id === 'all' ? '' : `&tab=${id}`}`
  const sections = (tab === 'all' ? (['people', 'feed', 'agora', 'gallery'] as const) : [tab]) as Array<Exclude<SearchTab, 'all'>>
  const total = res ? res.people.length + res.feed.length + res.agora.length + res.gallery.length : 0

  return (
    <div className="space-y-3">
      <header className="card p-4 sm:p-5 space-y-3">
        <h1 className="text-[20px] font-bold text-n-111"><T>검색</T></h1>
        <form action="/search" role="search" className="search-page-form">
          <input name="q" defaultValue={q ?? ''} placeholder={st('사람 · 글 · 갤러리 검색')} aria-label={st('검색어')} maxLength={60} className="input" enterKeyHint="search" />
          {tab !== 'all' && <input type="hidden" name="tab" value={tab} />}
        </form>
        {q && (
          <ChipBar label={st('검색 범위')}>
            {SEARCH_TABS.map((x) => (
              <Link key={x.id} href={href(x.id)} className={`tag-chip ${tab === x.id ? 'on' : ''}`} aria-current={tab === x.id ? 'page' : undefined}>
                <T>{x.label}</T>
                {res && x.id !== 'all' && res[x.id].length > 0 && <span className="tabular-nums opacity-70"> {res[x.id].length}</span>}
              </Link>
            ))}
          </ChipBar>
        )}
      </header>

      {!q ? (
        <EmptyList title={msg('무엇을 찾을까요?')} hint={msg('닉네임, 피드·아고라 글, 갤러리 이름으로 찾아요. 익명 게시판은 검색되지 않아요.')} />
      ) : total === 0 ? (
        <EmptyList title={st('‘{q}’에 맞는 결과가 없어요.', { q })} hint={msg('다른 단어로 찾아보세요.')} />
      ) : (
        sections.map((key) =>
          res![key].length === 0 ? null : (
            <section key={key} className="space-y-1.5">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-[14px] font-semibold text-n-333"><T>{SECTION[key]}</T></h2>
                {tab === 'all' && res![key].length >= 5 && (
                  <Link href={href(key)} className="text-[12.5px] text-link"><T>더 보기</T></Link>
                )}
              </div>
              <CompactList label={SECTION[key]}>
                {res![key].map((h: SearchHit) => (
                  <CompactRow
                    key={h.id}
                    href={h.href}
                    leading={key === 'people' ? <UserAvatar id={h.id} name={h.title} avatarUrl={h.avatarUrl ?? null} size="sm" /> : undefined}
                    title={h.title}
                    preview={h.sub}
                  />
                ))}
              </CompactList>
            </section>
          ),
        )
      )}
    </div>
  )
}
