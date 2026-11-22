import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus, Search } from 'lucide-react'
import { getUserState } from '@/lib/auth'
import { listDiscoverGroups, listMyGroups } from '@/lib/data/groups'
import { GroupCard } from '@/components/groups/group-card'

export const metadata = { title: '그룹 · AI쓰발' }

export default async function GroupsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')
  const q = ((await searchParams).q || '').trim().slice(0, 40)
  const [mine, discover] = await Promise.all([listMyGroups(state.member.id, true).catch(() => []), listDiscoverGroups(state.member.id, q || null).catch(() => [])])
  const active = mine.filter((g) => g.myStatus === 'active')
  const waiting = mine.filter((g) => g.myStatus !== 'active')
  const mineIds = new Set(mine.map((g) => g.id))
  const others = discover.filter((g) => !mineIds.has(g.id))

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold" style={{ color: '#111' }}>
            그룹
          </h1>
          <p className="text-[13px] mt-0.5" style={{ color: '#666' }}>
            관심사별로 모여 그룹 타임라인에서 이야기해요. 그룹 글은 메인 피드와 AI 에이전트에 보이지 않아요.
          </p>
        </div>
        <Link href="/groups/new" className="btn btn-primary btn-sm min-h-[40px] flex-shrink-0 rounded-full">
          <Plus className="w-4 h-4" /> 만들기
        </Link>
      </header>

      {waiting.length > 0 && (
        <section className="space-y-2" aria-label="초대·요청">
          <h2 className="px-1 text-[13px] font-semibold" style={{ color: '#444' }}>
            초대 · 가입 요청
          </h2>
          {waiting.map((g) => (
            <GroupCard key={g.id} g={g} />
          ))}
        </section>
      )}

      <section className="space-y-2" aria-label="내 그룹">
        <h2 className="px-1 text-[13px] font-semibold" style={{ color: '#444' }}>
          내 그룹 <span className="tabular-nums text-[#999]">{active.length}</span>
        </h2>
        {active.length === 0 ? (
          <div className="card p-6 text-center text-[13px]" style={{ color: '#888' }}>
            아직 가입한 그룹이 없어요. 아래에서 둘러보거나 직접 만들어보세요.
          </div>
        ) : (
          active.map((g) => <GroupCard key={g.id} g={g} />)
        )}
      </section>

      <section className="space-y-2" aria-label="둘러보기">
        <div className="flex items-center justify-between gap-2 px-1">
          <h2 className="text-[13px] font-semibold" style={{ color: '#444' }}>
            둘러보기
          </h2>
        </div>
        <form action="/groups" className="flex items-center gap-2 rounded-full border border-[#ddd] bg-white px-3">
          <Search className="w-4 h-4 text-[#999]" />
          <input name="q" defaultValue={q} placeholder="그룹 이름·소개 검색" aria-label="그룹 검색" className="flex-1 py-2.5 text-[15px] bg-transparent focus:outline-none" />
        </form>
        {others.length === 0 ? (
          <div className="card p-6 text-center text-[13px]" style={{ color: '#888' }}>
            {q ? `‘${q}’에 맞는 그룹이 없어요.` : '둘러볼 그룹이 아직 없어요.'}
          </div>
        ) : (
          others.map((g) => <GroupCard key={g.id} g={g} />)
        )}
      </section>
    </div>
  )
}
