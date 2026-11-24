'use client'

import Link from 'next/link'
import { ArrowDownUp, Check, ChevronDown } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { T } from '@/i18n/t'
import { tx } from '@/i18n/client'
import { msg } from '@/i18n/translate'

export type GallerySortItem = { id: string; label: string; href: string }

/** A85: sort labels read as an ordering ("인기순"), not as another category. */
const SORT_LABEL: Record<string, string> = { newest: msg('최신순'), popular: msg('인기순'), users: msg('많이 쓰는 순'), ai: msg('AI 평가순') }
const sortLabel = (s: GallerySortItem) => SORT_LABEL[s.id] ?? s.label

/** A85: the gallery's sort as a small muted "⇅ 인기순 ▾" control in the list header row (off the category tab row). */
export function GallerySort({ items, active }: { items: GallerySortItem[]; active: string }) {
  const cur = items.find((s) => s.id === active) ?? items[0]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="gallery-sort" aria-label={tx('정렬: {name}', { name: tx(sortLabel(cur)) })}>
        <ArrowDownUp className="w-3.5 h-3.5" aria-hidden />
        <T>{sortLabel(cur)}</T>
        <ChevronDown className="w-3.5 h-3.5" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[150px]">
        {items.map((s) => (
          <DropdownMenuItem key={s.id} render={<Link href={s.href} scroll={false} aria-current={s.id === active ? 'page' : undefined} />}>
            <span className="flex-1"><T>{sortLabel(s)}</T></span>
            {s.id === active && <Check className="w-4 h-4" aria-hidden />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
