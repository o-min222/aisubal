import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus } from 'lucide-react'
import { getUserState } from '@/lib/auth'
import { getMoim, listMoim, type MoimTab } from '@/lib/data/moim'
import { LinkTabs } from '@/components/link-tabs'
import { Pagination } from '@/components/pagination'
import { ReadingLayout, openHref } from '@/components/reading/reading-layout'
import { CompactList, EmptyList } from '@/components/reading/compact-row'
import { MoimRow } from '@/components/reading/moim-row'
import { MoimDetailView } from '@/components/detail/moim-detail-view'
import { isFeedId } from '@/lib/feed-ids'
import { parsePage, withParams } from '@/lib/paging'
import { pageSlice } from '@/lib/dashboard-tabs'
import { T } from '@/i18n/t'
import { msg } from '@/i18n/translate'
import { getT } from '@/i18n/server'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('모임 · AI쓰발') }
}
const PAGE = 15

const TABS: Array<{ id: MoimTab; label: string }> = [
  { id: 'upcoming', label: msg('다가오는') },
  { id: 'mine', label: msg('신청 현황') },
  { id: 'hosting', label: msg('내가 운영') },
  { id: 'past', label: msg('지난 모임') },
]

const EMPTY: Record<MoimTab, string> = {
  upcoming: msg('예정된 모임이 없어요. 첫 모임을 열어보세요.'),
  mine: msg('아직 신청한 모임이 없어요.'),
  hosting: msg('운영 중인 모임이 없어요. 개인 또는 내가 운영하는 그룹 이름으로 열 수 있어요.'),
  past: msg('지난 모임이 없어요.'),
}

export default async function MoimPage({ searchParams }: { searchParams: Promise<{ tab?: string; page?: string; open?: string }> }) {
  const st = await getT()
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')
  const sp = await searchParams
  const raw = sp.tab as MoimTab
  const tab: MoimTab = TABS.some((t) => t.id === raw) ? raw : 'upcoming'
  const open = sp.open && isFeedId(sp.open) ? sp.open : null
  const viewer = state.member.id
  const [all, detail] = await Promise.all([listMoim(viewer, tab, null, 300).catch(() => []), open ? getMoim(viewer, open).catch(() => null) : Promise.resolve(null)])

  // 신청 현황: my status order first so the applicant sees where each application stands
  const order = ['confirmed', 'waitlisted', 'pending', 'rejected', 'cancelled'] as const
  const sorted = tab === 'mine' ? [...all].sort((a, b) => order.indexOf(a.myRsvp?.status ?? 'cancelled') - order.indexOf(b.myRsvp?.status ?? 'cancelled')) : all
  const { items, totalPages, page } = pageSlice(sorted, parsePage(sp.page), PAGE)
  const base = withParams('/moim', { tab: tab === 'upcoming' ? null : tab, page: page > 1 ? page : null })

  const list = (
    <>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold" style={{ color: '#111' }}>
            <T>모임</T>
          </h1>
          <p className="text-[13px] mt-0.5" style={{ color: '#666' }}>
            <T>온라인·오프라인 모임. 정확한 장소와 링크는 참석이 확정된 사람에게만 보여요.</T>
          </p>
        </div>
        <Link href="/moim/new" className="btn btn-primary btn-sm min-h-[40px] flex-shrink-0 rounded-full">
          <Plus className="w-4 h-4" /> <T>모임 열기</T>
        </Link>
      </header>
      <div className="card" style={{ padding: '0 8px' }}>
        <LinkTabs label={msg('모임 보기')} active={tab} tabs={TABS.map((t) => ({ id: t.id, label: t.label, href: t.id === 'upcoming' ? '/moim' : `/moim?tab=${t.id}`, count: t.id === tab ? all.length : undefined }))} />
      </div>
      {items.length === 0 ? (
        <EmptyList title={page > 1 ? st('이 페이지에는 모임이 없어요') : EMPTY[tab]} />
      ) : (
        <CompactList label={msg('모임 목록')}>
          {items.map((m) => (
            <MoimRow key={m.id} moim={m} href={openHref(base, m.id)} active={detail?.id === m.id} />
          ))}
        </CompactList>
      )}
      <Pagination base={base} page={page} totalPages={totalPages} label={msg('모임 페이지')} />
    </>
  )

  return (
    <ReadingLayout
      list={list}
      openId={detail ? open : null}
      closeHref={base}
      fullHref={detail ? `/moim/${detail.id}` : null}
      paneTitle={st('모임')}
      emptyTitle={st('모임을 고르면 여기에서 봐요')}
      pane={detail ? <MoimDetailView m={detail} variant="pane" /> : null}
    />
  )
}
