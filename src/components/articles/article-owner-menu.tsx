'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { T } from '@/i18n/t'
import { tn, tx } from '@/i18n/client'
import { articleEditHref } from '@/lib/article-rules'

/**
 * A135: author-only ⋯ menu (수정 / 삭제) at the end of the byline row. Editing an article you are
 * reading is a property of the article, not a reaction to it, so it leaves the like/comment bar.
 * 삭제 hides a published article (comments stay readable by the author) and removes a draft.
 */
export function ArticleOwnerMenu({ articleId, slug, published }: { articleId: string; slug: string; published: boolean }) {
  const router = useRouter()
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  async function remove() {
    setBusy(true)
    const res = await fetch(`/api/articles/${articleId}`, { method: 'DELETE' }).catch(() => null)
    setBusy(false)
    if (!res?.ok) return toast.error(tn('삭제하지 못했어요.'))
    toast.success(tn('삭제했어요'))
    setConfirm(false)
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
      <AlertDialog open={confirm} onOpenChange={(o) => !busy && setConfirm(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle><T>이 아티클을 삭제할까요?</T></AlertDialogTitle>
            <AlertDialogDescription>
              {published ? <T>발행한 글은 바로 비공개로 바뀌고 목록과 공유 링크에서 사라져요.</T> : <T>초고는 완전히 지워지고 되돌릴 수 없어요.</T>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}><T>취소</T></AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={busy} onClick={() => void remove()}>
              {busy ? <T>삭제하는 중…</T> : <T>삭제</T>}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
