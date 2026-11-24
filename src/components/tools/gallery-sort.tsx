'use client'

import Link from 'next/link'
import { Check, ChevronDown } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { T } from '@/i18n/t'
import { tx } from '@/i18n/client'

export type GallerySortItem = { id: string; label: string; href: string }

/** A84: the gallery's sort as one small "최신 ▾" text menu at the end of the tab row (was a pill bar). */
export function GallerySort({ items, active }: { items: GallerySortItem[]; active: string }) {
  const cur = items.find((s) => s.id === active) ?? items[0]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="gallery-sort" aria-label={tx('정렬: {name}', { name: tx(cur.label) })}>
        <T>{cur.label}</T>
        <ChevronDown className="w-3.5 h-3.5" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[150px]">
        {items.map((s) => (
          <DropdownMenuItem key={s.id} render={<Link href={s.href} scroll={false} aria-current={s.id === active ? 'page' : undefined} />}>
            <span className="flex-1"><T>{s.label}</T></span>
            {s.id === active && <Check className="w-4 h-4" aria-hidden />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
