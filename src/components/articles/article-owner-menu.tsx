'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { T } from '@/i18n/t'
import { tx } from '@/i18n/client'
import { ArticleDeleteDialog } from '@/components/articles/article-delete-dialog'
import { articleEditHref } from '@/lib/article-rules'

/**
 * A135: author-only ⋯ menu (수정 / 삭제) at the end of the byline row. Editing an article you are
 * reading is a property of the article, not a reaction to it, so it leaves the like/comment bar.
 * 삭제 hides a published article (comments stay readable by the author) and removes a draft.
 */
export function ArticleOwnerMenu({ articleId, slug, published, title }: { articleId: string; slug: string; published: boolean; title?: string }) {
  const router = useRouter()
  const [confirm, setConfirm] = useState(false)

  function afterDelete() {
    router.replace('/articles/mine')
    router.refresh()
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="row-menu-btn article-owner-menu" aria-label={tx('내 아티클 메뉴')}>
          <MoreHorizontal className="w-5 h-5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[160px]">
          <DropdownMenuItem render={<Link href={articleEditHref(slug)} />}>
            <Pencil className="w-4 h-4" /> <T>수정</T>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setConfirm(true)}>
            <Trash2 className="w-4 h-4" /> <T>삭제</T>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ArticleDeleteDialog open={confirm} onOpenChange={setConfirm} articleId={articleId} title={title} published={published} onDeleted={afterDelete} />
    </>
  )
}
