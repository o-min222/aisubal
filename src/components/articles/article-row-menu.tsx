'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { T } from '@/i18n/t'
import { tx } from '@/i18n/client'
import { ArticleDeleteDialog } from '@/components/articles/article-delete-dialog'

/** A146: ⋯ menu on a row of 내 아티클 (수정 / 삭제) — drafts can be deleted without opening them. */
export function ArticleRowMenu({ articleId, editHref, title, published }: { articleId: string; editHref: string; title: string; published: boolean }) {
  const router = useRouter()
  const [confirm, setConfirm] = useState(false)
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="row-menu-btn article-row-menu" aria-label={tx('내 아티클 메뉴')}>
          <MoreHorizontal className="w-5 h-5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[160px]">
          <DropdownMenuItem render={<Link href={editHref} />}>
            <Pencil className="w-4 h-4" /> <T>수정</T>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setConfirm(true)}>
            <Trash2 className="w-4 h-4" /> <T>삭제</T>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ArticleDeleteDialog open={confirm} onOpenChange={setConfirm} articleId={articleId} title={title} published={published} onDeleted={() => router.refresh()} />
    </>
  )
}
