import Link from 'next/link'
import { Image as ImageIcon } from 'lucide-react'
import { AnonName } from '@/components/anon/anon-name'
import type { CommentPreview } from '@/components/timeline/types'
import { T } from '@/i18n/t'

/**
 * A46: a couple of comments under a feed card ("몇몇 댓글은 피드화면에서 그냥 바로 확인").
 * One quiet link block: name + one truncated line each, then "댓글 N개 모두 보기" when there are more.
 */
export function CommentPreviews({ items, total, href, anon }: { items: CommentPreview[]; total: number; href: string; anon?: boolean }) {
  if (!items.length) return null
  return (
    <Link href={`${href}#comments`} className="cmt-preview" data-comment-preview>
      {items.map((c) => (
        <span key={c.id} className="cmt-preview-row">
          <span className="cmt-preview-name">{anon ? <AnonName name={c.name} /> : c.name}</span>
          <span className="cmt-preview-body">{c.body || (c.hasImage ? <T>사진</T> : null)}</span>
          {c.hasImage && <ImageIcon className="cmt-preview-photo" aria-hidden />}
        </span>
      ))}
      {total > items.length && (
        <span className="cmt-preview-more"><T s="댓글 {n}개 모두 보기" vars={{ n: total.toLocaleString() }} /></span>
      )}
    </Link>
  )
}
