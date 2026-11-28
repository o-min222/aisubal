'use client'

import { useCallback } from 'react'
import { toast } from 'sonner'
import { tn } from '@/i18n/client'
import { postShareData, shareClipboardText } from '@/lib/share-rules'

/**
 * A149: the share action every share button uses. Opens the native share sheet when there is one,
 * otherwise copies the link (with the teaser line when given) and says so. Cancelling or a blocked
 * clipboard is silent, as before.
 */
export function useShare() {
  return useCallback(async (url: string, teaser?: string | null) => {
    try {
      if (navigator.share) await navigator.share(postShareData(url, teaser ?? null))
      else {
        await navigator.clipboard.writeText(shareClipboardText(url, teaser ?? null))
        toast.success(tn('링크를 복사했어요'))
      }
    } catch {
      /* cancelled, or clipboard blocked */
    }
  }, [])
}
