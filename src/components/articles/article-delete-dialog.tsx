'use client'

import { useState } from 'react'
import { toast } from 'sonner'
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
import { tn } from '@/i18n/client'

/**
 * A146: one confirm-then-delete dialog for every place an author can delete an article (reader ⋯ menu,
 * 내 아티클 list rows, the editor bar). DELETE /api/articles/:id → article_delete: a draft is removed for
 * good; a published article is hidden (comments stay readable by the author).
 */
export function ArticleDeleteDialog({
  open,
  onOpenChange,
  articleId,
  title,
  published,
  onDeleted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  articleId: string
  title?: string | null
  published: boolean
  onDeleted: () => void
}) {
  const [busy, setBusy] = useState(false)

  async function remove() {
    setBusy(true)
    const res = await fetch(`/api/articles/${articleId}`, { method: 'DELETE' }).catch(() => null)
    setBusy(false)
    if (!res?.ok) return toast.error(tn('삭제하지 못했어요.'))
    toast.success(tn('삭제했어요'))
    onOpenChange(false)
    onDeleted()
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle><T>이 아티클을 삭제할까요?</T></AlertDialogTitle>
          <AlertDialogDescription>
            {title?.trim() ? <span className="article-delete-title">{title.trim()}</span> : null}
            {published ? <T>발행한 글은 바로 비공개로 바뀌고 목록과 공유 링크에서 사라져요.</T> : <T>초고는 완전히 지워지고 되돌릴 수 없어요.</T>}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}><T>취소</T></AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={busy} onClick={(e) => { e.preventDefault(); void remove() }}>
            {busy ? <T>삭제하는 중…</T> : <T>삭제</T>}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
