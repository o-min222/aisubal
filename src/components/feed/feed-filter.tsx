'use client'

import Link from 'next/link'
import { Check, ChevronDown } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { T } from '@/i18n/t'
import { tx } from '@/i18n/client'

type FeedFilterItem = { id: string; label: string; href: string }

/** A59: the feed's only control — a small "전체 ▾" text menu instead of a tab bar (?f=).
 *  A60: the 아고라 uses the same menu with its own filters. */
export function FeedFilter({ items, active }: { items: FeedFilterItem[]; active: string }) {
  const cur = items.find((s) => s.id === active) ?? items[0]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="feed-filter" aria-label={tx('피드 범위: {name}', { name: tx(cur.label) })}>
        <T>{cur.label}</T>
        <ChevronDown className="w-4 h-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[160px]">
        {items.map((s) => (
          <DropdownMenuItem key={s.id} render={<Link href={s.href} aria-current={s.id === active ? 'page' : undefined} />}>
            <span className="flex-1"><T>{s.label}</T></span>
            {s.id === active && <Check className="w-4 h-4" aria-hidden />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
