import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus } from 'lucide-react'
import { getUserState } from '@/lib/auth'
import { listMoim, type MoimTab } from '@/lib/data/moim'
import { LinkTabs } from '@/components/link-tabs'
import { MoimCard } from '@/components/moim/moim-card'
import { RsvpBadge } from '@/components/moim/moim-badges'
import { RSVP_LABEL } from '@/lib/moim-rules'

export const metadata = { title: '모임 · AI쓰발' }

const TABS: Array<{ id: MoimTab; label: string }> = [
  { id: 'upcoming', label: '다가오는' },
  { id: 'mine', label: '신청 현황' },
  { id: 'hosting', label: '내가 운영' },
  { id: 'past', label: '지난 모임' },
]

const EMPTY: Record<MoimTab, string> = {
  upcoming: '예정된 모임이 없어요. 첫 모임을 열어보세요.',
  mine: '아직 신청한 모임이 없어요.',
  hosting: '운영 중인 모임이 없어요. 개인 또는 내가 운영하는 그룹 이름으로 열 수 있어요.',
  past: '지난 모임이 없어요.',
}

export default async function MoimPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')
  const raw = (await searchParams).tab as MoimTab
  const tab: MoimTab = TABS.some((t) => t.id === raw) ? raw : 'upcoming'
  const list = await listMoim(state.member.id, tab).catch(() => [])

  // 신청 현황: group by my status so the applicant sees where each application stands
  const order = ['confirmed', 'waitlisted', 'pending', 'rejected', 'cancelled'] as const
  const byStatus = tab === 'mine' ? order.map((s) => ({ s, items: list.filter((m) => m.myRsvp?.status === s) })).filter((g) => g.items.length) : []

  return (
    <div className="space-y-3">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold" style={{ color: '#111' }}>
            모임
          </h1>
          <p className="text-[13px] mt-0.5" style={{ color: '#666' }}>
            온라인·오프라인 모임. 정확한 장소와 링크는 참석이 확정된 사람에게만 보여요.
          </p>
        </div>
        <Link href="/moim/new" className="btn btn-primary btn-sm min-h-[40px] flex-shrink-0 rounded-full">
          <Plus className="w-4 h-4" /> 모임 열기
        </Link>
      </header>
      <div className="card" style={{ padding: '0 8px' }}>
        <LinkTabs label="모임 보기" active={tab} tabs={TABS.map((t) => ({ id: t.id, label: t.label, href: t.id === 'upcoming' ? '/moim' : `/moim?tab=${t.id}` }))} />
      </div>
      {list.length === 0 ? (
        <div className="card p-10 text-center text-sm" style={{ color: '#888' }}>
          {EMPTY[tab]}
        </div>
      ) : tab === 'mine' ? (
        <div className="space-y-4">
          {byStatus.map(({ s, items }) => (
            <section key={s} className="space-y-2" aria-label={RSVP_LABEL[s]}>
              <h2 className="flex items-center gap-2 px-1 text-[13px] font-semibold" style={{ color: '#444' }}>
                <RsvpBadge status={s} /> <span className="tabular-nums text-[#999]">{items.length}</span>
              </h2>
              {items.map((m) => (
                <MoimCard key={m.id} moim={m} />
              ))}
            </section>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((m) => (
            <MoimCard key={m.id} moim={m} />
          ))}
        </div>
      )}
    </div>
  )
}
