'use client'

import { Flag, EyeOff, Eye } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { tx, tn } from '@/i18n/client'

export function AgoraPostActions({
  postId,
  isAdmin,
  isHidden,
}: {
  postId: string
  isAdmin: boolean
  isHidden?: boolean
}) {
  const router = useRouter()

  async function flag() {
    const reason = window.prompt(tx('신고 사유를 적어주세요 (선택)')) ?? null
    if (reason === null) return
    const res = await fetch(`/api/agora/${postId}/flag`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    })
    if (res.ok) toast.success(tn('신고가 접수되었어요.'))
    else toast.error(tn('신고에 실패했어요.'))
  }

  async function toggleHidden() {
    const res = await fetch(`/api/agora/${postId}/hide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hidden: !isHidden }),
    })
    if (res.ok) {
      toast.success(isHidden ? tn('다시 보이게 했어요.') : tn('숨겼어요.'))
      router.refresh()
    } else toast.error(tn('처리에 실패했어요.'))
  }

  return (
    <>
      <button
        type="button"
        onClick={flag}
        className="inline-flex items-center justify-center w-8 h-8 rounded-full text-n-999 hover:bg-n-f2f2f2 hover:text-n-111"
        aria-label={tx('신고')}
        title={tx('신고')}
      >
        <Flag className="w-4 h-4" />
      </button>
      {isAdmin && (
        <button
          type="button"
          onClick={toggleHidden}
          className="inline-flex items-center justify-center w-8 h-8 rounded-full text-n-999 hover:bg-n-f2f2f2 hover:text-n-111"
          aria-label={isHidden ? tx('숨김 해제') : tx('숨기기')}
          title={isHidden ? tx('숨김 해제') : tx('숨기기 (관리자)')}
        >
          {isHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </button>
      )}
    </>
  )
}
