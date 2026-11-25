'use client'

import { Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { T } from '@/i18n/t'
import { tn } from '@/i18n/client'
import { shareClipboardText } from '@/lib/share-rules'

/** A91: share a profile (native sheet on phones, copy link elsewhere). */
export function ProfileShareButton({ path, name }: { path: string; name: string }) {
  async function share() {
    const url = new URL(path, window.location.origin).toString()
    try {
      if (navigator.share) await navigator.share({ title: name, text: name, url })
      else {
        await navigator.clipboard.writeText(shareClipboardText(url, name))
        toast.success(tn('링크를 복사했어요'))
      }
    } catch {
      /* cancelled */
    }
  }
  return (
    <button type="button" onClick={() => void share()} className="btn btn-secondary btn-sm min-h-[40px] rounded-full">
      <Share2 className="w-4 h-4" /> <T>공유</T>
    </button>
  )
}
