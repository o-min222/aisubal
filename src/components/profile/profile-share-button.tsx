'use client'

import { Share2 } from 'lucide-react'
import { T } from '@/i18n/t'
import { useShare } from '@/hooks/use-share'

/** A91 / A101: share a profile (native sheet on phones, copy link elsewhere). Title is the site name only — no member name, handle or avatar in the sheet or clipboard. */
export function ProfileShareButton({ path }: { path: string; name?: string }) {
  const shareLink = useShare()
  const share = () => shareLink(new URL(path, window.location.origin).toString())
  return (
    <button type="button" onClick={() => void share()} className="btn btn-secondary btn-sm min-h-[40px] rounded-full">
      <Share2 className="w-4 h-4" /> <T>공유</T>
    </button>
  )
}
