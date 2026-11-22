import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus, Search } from 'lucide-react'
import { getUserState } from '@/lib/auth'
import { listDiscoverGroups, listMyGroups } from '@/lib/data/groups'
import { LinkTabs } from '@/components/link-tabs'
import { Pagination } from '@/components/pagination'
import { CompactList, EmptyList } from '@/components/reading/compact-row'
import { GroupRow } from '@/components/reading/group-row'
import { parsePage, withParams } from '@/lib/paging'
import { pageSlice } from '@/lib/dashboard-tabs'
import { T } from '@/i18n/t'
import { getT } from '@/i18n/server'
import { msg } from '@/i18n/translate'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('그룹 · AI쓰발') }
}

type GroupsTab = 'mine' | 'discover' | 'waiting'
const PAGE = 15

export default async function GroupsPage({ searchParams }: { searchParams: Promise<{ q?: string; tab?: string; page?: string }> }) {
  const st = await getT()
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')
  const sp = await searchParams
  const q = (sp.q || '').trim().slice(0, 40)
  const [mine, discover] = await Promise.all([listMyGroups(state.member.id, true).catch(() => []), listDiscoverGroups(state.member.id, q || null).catch(() => [])])
  const active = mine.filter((g) => g.myStatus === 'active')
  const waiting = mine.filter((g) => g.myStatus !== 'active')
  const mineIds = new Set(mine.map((g) => g.id))
  const others = discover.filter((g) => !mineIds.has(g.id))
  // default: my groups if I have any, else discover; a search always shows discover
  const fallback: GroupsTab = q ? 'discover' : active.length ? 'mine' : 'discover'
  const tab: GroupsTab = sp.tab === 'mine' || sp.tab === 'discover' || (sp.tab === 'waiting' && waiting.length) ? (sp.tab as GroupsTab) : fallback
  const source = tab === 'mine' ? active : tab === 'waiting' ? waiting : others
  const { items, totalPages, page } = pageSlice(source, parsePage(sp.page), PAGE)
  const tabHref = (t: GroupsTab) => withParams('/groups', { tab: t, q: t === 'discover' ? q || null : null })
  const tabs = [
    { id: 'mine', label: st('내 그룹'), href: tabHref('mine'), count: active.length },
    { id: 'discover', label: st('둘러보기'), href: tabHref('discover'), count: others.length },
    ...(waiting.length ? [{ id: 'waiting', label: st('초대 · 요청'), href: tabHref('waiting'), count: waiting.length, dot: true }] : []),
  ]
  const empty =
    tab === 'mine' ? st('아직 가입한 그룹이 없어요. 둘러보거나 직접 만들어보세요.') : tab === 'waiting' ? st('받은 초대나 보낸 요청이 없어요.') : q ? st('‘{q}’에 맞는 그룹이 없어요.', { q }) : st('둘러볼 그룹이 아직 없어요.')

  return (
    <div className="space-y-3">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold" style={{ color: 'var(--n-111)' }}>
            <T>그룹</T>
          </h1>
          <p className="text-[13px] mt-0.5" style={{ color: 'var(--n-666)' }}>
            <T>관심사별로 모여 그룹 타임라인에서 이야기해요. 그룹 글은 메인 피드와 AI 에이전트에 보이지 않아요.</T>
          </p>
        </div>
        <Link href="/groups/new" className="btn btn-primary btn-sm min-h-[40px] flex-shrink-0 rounded-full">
          <Plus className="w-4 h-4" /> <T>만들기</T>
        </Link>
      </header>
      <div className="card" style={{ padding: '0 8px' }}>
        <LinkTabs label={msg('그룹 보기')} active={tab} tabs={tabs} />
      </div>
      {tab === 'discover' && (
        <form action="/groups" className="flex items-center gap-2 rounded-full border border-n-ddd bg-n-fff px-3">
          <input type="hidden" name="tab" value="discover" />
          <Search className="w-4 h-4 text-n-999" />
          <input name="q" defaultValue={q} placeholder={st('그룹 이름·소개 검색')} aria-label={st('그룹 검색')} className="flex-1 py-2.5 text-[15px] bg-transparent focus:outline-none" />
        </form>
      )}
      {items.length === 0 ? (
        <EmptyList title={empty} />
      ) : (
        <CompactList label={msg('그룹 목록')}>
          {items.map((g) => (
            <GroupRow key={g.id} g={g} />
          ))}
        </CompactList>
      )}
      <Pagination base={withParams('/groups', { tab, q: tab === 'discover' ? q || null : null })} page={page} totalPages={totalPages} label={msg('그룹 페이지')} />
    </div>
  )
}
