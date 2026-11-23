'use client'

import { useState } from 'react'
import { Award, Bot, Flame, Heart, Milestone, PenLine, Ticket, Wrench, Star, Crown } from 'lucide-react'
import { AdaptiveSheet } from '@/components/adaptive-sheet'
import { BADGES, badgeDef, badgeTierLabel, type BadgeId, type MemberBadge } from '@/lib/badges'
import { T } from '@/i18n/t'
import { tx } from '@/i18n/client'

const ICON: Record<BadgeId, typeof Award> = {
  founder: Milestone,
  first_post: PenLine,
  liked: Heart,
  gallery: Wrench,
  reviewer: Star,
  inviter: Ticket,
  invite_king: Crown,
  streak: Flame,
  agent: Bot,
}

/** A compact row: the rest sit behind '+N' in the sheet. */
const MAX_CHIPS = 5

const DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })

function TierDots({ id, tier }: { id: BadgeId; tier: number }) {
  const total = badgeDef(id)?.tiers.length ?? 1
  if (total < 2) return null
  return (
    <span className="badge-tier" aria-label={tx('{tier}/{total}단계', { tier, total })}>
      {Array.from({ length: total }, (_, i) => <i key={i} className={i < tier ? 'on' : undefined} />)}
    </span>
  )
}

/** Compact badge chips; tapping one opens a sheet that says how each was earned. */
export function BadgeChips({ badges, isMe, initialOpen = null }: { badges: MemberBadge[]; isMe: boolean; initialOpen?: string | null }) {
  // ?badges=<id> (the award notification's link) opens the sheet on that badge
  const deepLinked = Boolean(initialOpen && badges.some((b) => b.badge === initialOpen))
  const [open, setOpen] = useState(deepLinked)
  const [focus, setFocus] = useState<string | null>(deepLinked ? initialOpen : null)
  if (!badges.length) return null
  return (
    <>
      <div className="badge-chips" aria-label={tx('배지')}>
        {badges.slice(0, MAX_CHIPS).map((b) => {
          const Icon = ICON[b.badge] ?? Award
          return (
            <button key={b.badge} type="button" className="badge-chip" onClick={() => { setFocus(b.badge); setOpen(true) }}>
              <span className="badge-ico"><Icon className="w-3 h-3" /></span>
              <T>{badgeTierLabel(b.badge, b.tier) ?? ''}</T>
              {b.badge === 'founder' && <span className="text-n-888 font-normal tabular-nums">#{b.value}</span>}
              <TierDots id={b.badge} tier={b.tier} />
            </button>
          )
        })}
        {badges.length > MAX_CHIPS && (
          <button type="button" className="badge-chip" onClick={() => { setFocus(null); setOpen(true) }} aria-label={tx('배지 {n}개 더 보기', { n: badges.length - MAX_CHIPS })}>
            +{badges.length - MAX_CHIPS}
          </button>
        )}
      </div>
      <AdaptiveSheet open={open} onOpenChange={setOpen} title={tx('배지')}>
        <p className="text-[12.5px] mb-2" style={{ color: 'var(--n-777)' }}>
          {isMe ? tx('활동하면 자동으로 받아요. 한 번 받은 배지는 없어지지 않아요.') : tx('활동하면 자동으로 받는 배지예요.')}
        </p>
        <ul className="badge-list">
          {badges.map((b) => {
            const d = badgeDef(b.badge)
            if (!d) return null
            const Icon = ICON[b.badge] ?? Award
            return (
              <li key={b.badge} className={`badge-item${focus === b.badge ? ' is-focus' : ''}`}>
                <span className="badge-ico"><Icon className="w-4 h-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[14px] font-semibold" style={{ color: 'var(--n-111)' }}>
                    <T>{badgeTierLabel(b.badge, b.tier) ?? ''}</T>
                    <TierDots id={b.badge} tier={b.tier} />
                  </span>
                  <span className="block text-[12.5px]" style={{ color: 'var(--n-666)' }}>
                    {tx(d.how, { v: b.value })}
                    {b.tier < d.tiers.length && <> · {tx('다음 단계: {next}', { next: tx(d.labels[b.tier]) })}</>}
                  </span>
                  <span className="block text-[11.5px]" style={{ color: 'var(--n-999)' }}>
                    {tx('{date} 받음', { date: DAY.format(new Date(b.updatedAt)) })}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
        {isMe && badges.length < BADGES.length && (
          <p className="text-[12px] mt-2" style={{ color: 'var(--n-888)' }}>
            {tx('아직 {n}개가 더 있어요. 글쓰기, 리뷰, 초대, 매일 들르기로 받을 수 있어요.', { n: BADGES.length - badges.length })}
          </p>
        )}
      </AdaptiveSheet>
    </>
  )
}
