'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { CalendarDays, MapPin, Monitor, Users, Plus } from 'lucide-react'
import type { Member } from '@/lib/supabase/types'
import type { MeetupWithDetails } from '@/lib/data/types'
import { AuthorAvatar } from '@/components/user-avatar'
import { publicAuthorLabel } from '@/lib/profile'
import { isPastMeetup } from '@/lib/meetup-rules'

interface MeetupsClientProps {
  meetups: MeetupWithDetails[]
  member: Member
}

type Tab = 'upcoming' | 'past' | 'calendar'

const CALENDAR_MONTHS: { year: number; month: number; label: string }[] = [
  { year: 2026, month: 10, label: '2026년 11월' },
  { year: 2026, month: 11, label: '2026년 12월' },
]

function formatKst(iso: string) {
  return new Date(iso).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function seoulDateKey(iso: string) {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
}

function MeetupListItem({ meetup }: { meetup: MeetupWithDetails }) {
  const hostLabel = publicAuthorLabel(meetup.host)
  const venue =
    meetup.mode === 'online' ? '온라인' : meetup.venue_name || '오프라인 장소'

  return (
    <article className="feed-item">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className={`badge ${meetup.mode === 'online' ? 'badge-mcp' : 'badge-note'}`}>
              {meetup.mode === 'online' ? (
                <>
                  <Monitor className="w-3 h-3 mr-1 inline" />
                  온라인
                </>
              ) : (
                <>
                  <MapPin className="w-3 h-3 mr-1 inline" />
                  오프라인
                </>
              )}
            </span>
            {meetup.status === 'cancelled' && (
              <span className="badge bg-[#eee] text-[#666]">취소됨</span>
            )}
            {meetup.requires_approval && (
              <span className="badge badge-agent">승인제</span>
            )}
          </div>

          <Link href={`/meetups/${meetup.id}`}>
            <h3 className="feed-item-title">{meetup.title}</h3>
          </Link>

          <p className="text-sm text-[#666] mt-1">{formatKst(meetup.starts_at)}</p>
          <p className="text-sm text-[#888] mt-0.5 flex items-center gap-1">
            {meetup.mode === 'offline' ? <MapPin className="w-3.5 h-3.5" /> : <Monitor className="w-3.5 h-3.5" />}
            {venue}
          </p>

          <div className="feed-item-meta mt-3">
            <div className="flex items-center gap-2">
              <AuthorAvatar author={meetup.host} size="sm" />
              <span>{hostLabel}</span>
            </div>
            <span>·</span>
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              {meetup.confirmed_count}/{meetup.capacity}
            </span>
          </div>
        </div>

        <Link href={`/meetups/${meetup.id}`} className="btn btn-secondary btn-sm shrink-0">
          상세 보기
        </Link>
      </div>
    </article>
  )
}

function MonthCalendar({
  year,
  month,
  label,
  meetupsByDay,
  selectedDay,
  onSelectDay,
}: {
  year: number
  month: number
  label: string
  meetupsByDay: Map<string, MeetupWithDetails[]>
  selectedDay: string | null
  onSelectDay: (key: string | null) => void
}) {
  const firstDow = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  return (
    <div className="card p-4">
      <h3 className="text-sm font-semibold text-[#111] mb-3 flex items-center gap-2">
        <CalendarDays className="w-4 h-4" />
        {label}
      </h3>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-[#888] mb-2">
        {['일', '월', '화', '수', '목', '금', '토'].map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, idx) => {
          if (day === null) {
            return <div key={`e-${idx}`} className="aspect-square" />
          }
          const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const hasMeetups = meetupsByDay.has(key)
          const isSelected = selectedDay === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDay(isSelected ? null : key)}
              className={`aspect-square rounded-md text-sm flex flex-col items-center justify-center gap-0.5 transition-colors ${
                isSelected
                  ? 'bg-[#111] text-white'
                  : hasMeetups
                    ? 'bg-[#f0f7ff] text-[#0066cc] hover:bg-[#e0efff]'
                    : 'text-[#666] hover:bg-[#f7f7f7]'
              }`}
            >
              <span>{day}</span>
              {hasMeetups && (
                <span
                  className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-[#0066cc]'}`}
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function MeetupsClient({ meetups, member: _member }: MeetupsClientProps) {
  const [tab, setTab] = useState<Tab>('upcoming')
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const now = useMemo(() => new Date(), [])

  const upcoming = useMemo(
    () => meetups.filter((m) => m.status === 'open' && !isPastMeetup(m, now)),
    [meetups, now]
  )

  const past = useMemo(
    () =>
      meetups.filter(
        (m) =>
          m.status === 'past' ||
          m.status === 'cancelled' ||
          (m.status === 'open' && isPastMeetup(m, now))
      ),
    [meetups, now]
  )

  const meetupsByDay = useMemo(() => {
    const map = new Map<string, MeetupWithDetails[]>()
    for (const m of meetups) {
      const key = seoulDateKey(m.starts_at)
      const list = map.get(key) ?? []
      list.push(m)
      map.set(key, list)
    }
    return map
  }, [meetups])

  const calendarList = useMemo(() => {
    if (!selectedDay) return meetups.filter((m) => !isPastMeetup(m) || m.status === 'past')
    return meetups.filter((m) => seoulDateKey(m.starts_at) === selectedDay)
  }, [meetups, selectedDay])

  const listForTab =
    tab === 'upcoming' ? upcoming : tab === 'past' ? past : calendarList

  return (
    <div className="layout-grid">
      <aside className="hidden lg:block">
        <div className="left-nav">
          <Link href="/meetups" className="left-nav-item active">
            <CalendarDays className="w-4 h-4" />
            모임
          </Link>
          <Link href="/feed" className="left-nav-item">
            피드
          </Link>
        </div>
      </aside>

      <div className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#111]">모임</h1>
            <p className="text-sm text-[#666] mt-1">
              오프라인·온라인 밋업을 둘러보고 직접 모임을 열어 보세요.
            </p>
          </div>
          <Link href="/meetups/new" className="btn btn-primary btn-sm inline-flex items-center gap-2">
            <Plus className="w-4 h-4" />
            모임 만들기
          </Link>
        </div>

        <div className="tab-filters">
          <button
            type="button"
            onClick={() => {
              setTab('upcoming')
              setSelectedDay(null)
            }}
            className={`tab-filter ${tab === 'upcoming' ? 'active' : ''}`}
          >
            다가오는
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('past')
              setSelectedDay(null)
            }}
            className={`tab-filter ${tab === 'past' ? 'active' : ''}`}
          >
            지난
          </button>
          <button
            type="button"
            onClick={() => setTab('calendar')}
            className={`tab-filter ${tab === 'calendar' ? 'active' : ''}`}
          >
            캘린더
          </button>
        </div>

        {tab === 'calendar' && (
          <div className="grid gap-4 md:grid-cols-2">
            {CALENDAR_MONTHS.map(({ year, month, label }) => (
              <MonthCalendar
                key={label}
                year={year}
                month={month}
                label={label}
                meetupsByDay={meetupsByDay}
                selectedDay={selectedDay}
                onSelectDay={setSelectedDay}
              />
            ))}
          </div>
        )}

        {tab === 'calendar' && selectedDay && (
          <p className="text-sm text-[#666]">
            {selectedDay} 모임 ·{' '}
            <button
              type="button"
              className="text-[#0066cc] hover:underline"
              onClick={() => setSelectedDay(null)}
            >
              전체 보기
            </button>
          </p>
        )}

        <div className="space-y-3">
          {listForTab.length === 0 ? (
            <div className="card p-8 text-center text-sm text-[#888]">
              {tab === 'upcoming' && '예정된 모임이 없습니다. 첫 모임을 만들어 보세요.'}
              {tab === 'past' && '지난 모임 기록이 아직 없습니다.'}
              {tab === 'calendar' &&
                (selectedDay
                  ? '이 날짜에 등록된 모임이 없습니다.'
                  : '캘린더에서 날짜를 눌러 모임을 확인하세요.')}
            </div>
          ) : (
            listForTab.map((m) => <MeetupListItem key={m.id} meetup={m} />)
          )}
        </div>
      </div>

      <aside className="hidden lg:block space-y-4">
        <div className="sidebar-module">
          <h3 className="sidebar-title flex items-center gap-2">
            <CalendarDays className="w-4 h-4" />
            빠른 이동
          </h3>
          <div className="space-y-2 text-sm">
            <Link href="/meetups/new" className="block text-[#0066cc] hover:underline">
              새 모임 만들기
            </Link>
            <Link href="/feed" className="block text-[#666] hover:text-[#111]">
              피드로 돌아가기
            </Link>
          </div>
        </div>

        <div className="sidebar-module">
          <h3 className="sidebar-title">이번 달 하이라이트</h3>
          <div className="space-y-3">
            {upcoming.slice(0, 3).map((m) => (
              <Link key={m.id} href={`/meetups/${m.id}`} className="block group">
                <p className="text-sm font-medium text-[#111] group-hover:text-[#0066cc] line-clamp-2">
                  {m.title}
                </p>
                <p className="text-xs text-[#888] mt-0.5">{formatKst(m.starts_at)}</p>
              </Link>
            ))}
            {upcoming.length === 0 && (
              <p className="text-xs text-[#888]">다가오는 모임이 없습니다.</p>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}