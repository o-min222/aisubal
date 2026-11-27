'use client'

import { useState } from 'react'
import Link from 'next/link'
import { UserCog, Users } from 'lucide-react'
import type { MoimDetail } from '@/lib/data/moim'
import { AdaptiveSheet } from '@/components/adaptive-sheet'
import { UserAvatar } from '@/components/user-avatar'
import { CapacityBar } from './moim-badges'
import { MoimHostPanel } from './moim-host-panel'
import { T } from '@/i18n/t'
import { tx } from '@/i18n/client'

const STACK = 5

/**
 * A38: the top card's people block.
 *  - capacity row (the host counts as confirmed since 0091) + '참석자 관리' for hosts / group managers,
 *    which opens the host tools in a sheet instead of a section in the page body
 *  - host row with the confirmed participants beside it; tapping opens the full list
 * Names: every member who can see the meetup (0093); members-only group meetups keep them to
 * group members, who are the only ones the server sends `attendees` to.
 */
export function MoimPeople({ m }: { m: MoimDetail }) {
  const [list, setList] = useState(false)
  const [manage, setManage] = useState(false)
  const attendees = m.attendees
  const others = (attendees || []).filter((a) => a.id !== m.host.id)
  const othersCount = Math.max(0, m.confirmed - 1)
  const pending = (m.applicants || []).filter((a) => a.status === 'pending').length

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-[14px]" style={{ color: 'var(--n-333)' }}>
        <Users className="w-4 h-4 flex-shrink-0 text-n-777" />
        <CapacityBar confirmed={m.confirmed} capacity={m.capacity} />
        {m.waitlisted > 0 && <span className="text-[12.5px] text-c-3446a8"><T s="대기 {n}명" vars={{ n: m.waitlisted }} /></span>}
        {m.interested > 0 && <span className="text-[12.5px]" style={{ color: 'var(--c-5b3fc4)' }}><T s="관심 {n}명" vars={{ n: m.interested }} /></span>}
        {m.canManage && m.applicants && (
          <button type="button" className="btn btn-secondary btn-sm min-h-[36px] rounded-full ml-auto" onClick={() => setManage(true)}>
            <UserCog className="w-3.5 h-3.5" /> <T>참석자 관리</T>
            {pending > 0 && <span className="moim-pending tabular-nums" aria-label={tx('승인 대기 {n}명', { n: pending })}>{pending}</span>}
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="inline-flex items-center gap-2 min-w-0">
          <UserAvatar id={m.host.id} name={m.host.name} avatarUrl={m.host.avatarUrl} size="sm" />
          <span className="text-[13px] text-n-555 min-w-0 truncate">
            <T s="호스트 {v}" vars={{ v: m.host.kind === 'real' ? (
              <Link href={`/members/${m.host.id}`} className="font-semibold" style={{ color: 'var(--n-111)' }}>{m.host.name}</Link>
            ) : (
              <b style={{ color: 'var(--n-111)' }}>{m.host.name}</b>
            ) }} />
          </span>
        </span>
        <button type="button" className="moim-people" disabled={attendees === null} onClick={() => setList(true)} aria-label={tx('참석 확정 {n}명 보기', { n: m.confirmed })}>
          {others.length > 0 && (
            <span className="moim-avs" aria-hidden>
              {others.slice(0, STACK).map((a) => (
                <UserAvatar key={a.memberId} id={a.id} name={a.name} avatarUrl={a.avatarUrl} size="sm" />
              ))}
            </span>
          )}
          <span className="text-[13px] text-n-555 tabular-nums">
            {othersCount > 0 ? <T s="참여 {n}명" vars={{ n: othersCount }} /> : <T>아직 참여자가 없어요</T>}
          </span>
        </button>
        {m.group && <span className="text-[12.5px] text-n-888"><T s="{name} 그룹 모임" vars={{ name: m.group.name }} /></span>}
      </div>

      <AdaptiveSheet open={list} onOpenChange={setList} title={tx('참석 확정 {n}명', { n: m.confirmed })} className="sm:!max-w-md">
        {attendees === null ? null : attendees.length === 0 ? (
          <p className="text-[13px] text-n-888 py-2"><T>아직 확정된 참석자가 없어요.</T></p>
        ) : (
          <ul>
            {[...attendees].sort((a, b) => Number(b.id === m.host.id) - Number(a.id === m.host.id)).map((a) => {
              const inner = (
                <>
                  <UserAvatar id={a.id} name={a.name} avatarUrl={a.avatarUrl} size="sm" />
                  <span className="truncate" style={{ color: 'var(--n-111)' }}>{a.name}</span>
                  {a.id === m.host.id && <span className="text-[12px] text-n-888 ml-auto"><T>호스트</T></span>}
                </>
              )
              return (
                <li key={a.memberId}>
                  {a.kind === 'real' ? (
                    <Link href={`/members/${a.id}`} className="sheet-row" onClick={() => setList(false)}>{inner}</Link>
                  ) : (
                    <span className="sheet-row">{inner}</span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {m.interestedPeople && m.interestedPeople.length > 0 && (
          <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--n-ececec)' }}>
            <h3 className="text-[13px] font-semibold mb-2" style={{ color: 'var(--n-555)' }}>
              <T s="관심 {n}명" vars={{ n: m.interestedPeople.length }} />
            </h3>
            <ul>
              {m.interestedPeople.map((a) => {
                const inner = (
                  <>
                    <UserAvatar id={a.id} name={a.name} avatarUrl={a.avatarUrl} size="sm" />
                    <span className="truncate" style={{ color: 'var(--n-111)' }}>{a.name}</span>
                  </>
                )
                return (
                  <li key={a.memberId}>
                    {a.kind === 'real' ? (
                      <Link href={`/members/${a.id}`} className="sheet-row" onClick={() => setList(false)}>{inner}</Link>
                    ) : (
                      <span className="sheet-row">{inner}</span>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </AdaptiveSheet>

      {m.canManage && m.applicants && (
        <AdaptiveSheet open={manage} onOpenChange={setManage} title={tx('참석자 관리')} className="sm:!max-w-lg">
          <MoimHostPanel moim={m} bare />
        </AdaptiveSheet>
      )}
    </>
  )
}
