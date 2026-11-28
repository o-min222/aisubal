'use client'

import { toast } from 'sonner'
import { tn } from '@/i18n/client'

/**
 * A148: copy text and say so. The same writeText → '복사했어요.' / '복사하지 못했어요.' toast pair was
 * hand-written at several call sites (one forgot the failure toast).
 */
export function copyWithToast(text: string): Promise<boolean> {
  return navigator.clipboard.writeText(text).then(
    () => {
      toast.success(tn('복사했어요.'))
      return true
    },
    () => {
      toast.error(tn('복사하지 못했어요.'))
      return false
    }
  )
}
