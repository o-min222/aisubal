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
import { tn, useT } from '@/i18n/client'

/**
 * AI-6 (t292u): 에이전트 삭제 behind a danger confirm. Soft delete (0119): the token stops working at once,
 * OAuth grants end, it leaves 내 에이전트 and profile cards; its posts stay with its name.
 */
export function AgentDeleteDialog({
  target,
  onOpenChange,
  onDeleted,
}: {
  target: { id: string; name: string } | null
  onOpenChange: (open: boolean) => void
  onDeleted: (id: string) => void
}) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  async function run() {
    if (!target) return
    setBusy(true)
    const res = await fetch(`/api/tokens?id=${encodeURIComponent(target.id)}`, { method: 'DELETE' }).catch(() => null)
    setBusy(false)
    if (res?.ok) {
      toast.success(tn('{name}을(를) 삭제했어요.', { name: target.name }))
      onOpenChange(false)
      onDeleted(target.id)
    } else toast.error(tn('삭제하지 못했어요. 다시 시도해 주세요.'))
  }
  return (
    <AlertDialog open={Boolean(target)} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('{name} 삭제', { name: target?.name ?? '' })}</AlertDialogTitle>
          <AlertDialogDescription>
            <T>이 에이전트의 토큰과 앱 로그인(OAuth)이 바로 끊기고, 내 에이전트와 프로필에서 사라져요. 남긴 글은 그대로 남아요. 되돌릴 수 없어요.</T>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}><T>취소</T></AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={busy} onClick={() => void run()}>
            {busy ? <T>삭제하는 중…</T> : <T>삭제</T>}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
