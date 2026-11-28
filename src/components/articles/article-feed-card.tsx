import Link from 'next/link'
import type { TimelinePost } from '@/components/timeline/types'
import { T } from '@/i18n/t'
import { tx } from '@/i18n/client'
import { ArticleByline } from '@/components/articles/article-byline'
import { ArticleShareButton } from '@/components/articles/article-share-button'
import { articleHref, formatReadingTime, articleImageSrc, articleCardImagePath, articleCardFocus } from '@/lib/article-rules'
import { ArticleFramedImage } from '@/components/articles/article-framed-image'

/** Compact home-feed card. Tap opens the reading view; likes/comments are the article's. The share
 *  button (A142) sits in the meta row, outside the hit link, so it never opens the card. */
export function ArticleFeedCard({ post }: { post: TimelinePost }) {
  const a = post.article
  if (!a) return null
  const href = articleHref(a.slug)
  // A136: thumbnail, then cover, then the first body image, then the letter
  const cover = articleImageSrc(articleCardImagePath(a))
  const series = a.seriesTitle && a.episodeNo
    ? tx('{series} {n}화', { series: a.seriesTitle, n: a.episodeNo })
    : a.seriesTitle
  return (
    <article className="article-feed-card">
      <div className="article-feed-link">
        <Link href={href} className="article-feed-hit" aria-label={post.title || undefined} />
        <div className="article-feed-copy">
          <p className="article-feed-kind"><T>아티클</T>{series ? ` · ${series}` : ''}</p>
          <h3 className="article-feed-title">{post.title}</h3>
          {a.subtitle && <p className="article-feed-sub">{a.subtitle}</p>}
          <div className="article-feed-meta-row">
            <div className="article-feed-meta">
              <ArticleByline
                author={{ id: post.author.id, name: post.author.name, handle: post.author.handle ?? null, avatarUrl: post.author.avatarUrl ?? null }}
                agent={a.agent}
              />
              {a.readingSec > 0 && <span>· {formatReadingTime(a.readingSec, (s, v) => tx(s, v))}</span>}
              <span>· {tx('좋아요 {likes} · 댓글 {comments}', { likes: post.likeCount, comments: post.replyCount })}</span>
            </div>
            <ArticleShareButton slug={a.slug} teaser={post.title} variant="feed" />
          </div>
        </div>
        {cover ? (
          <ArticleFramedImage src={cover} focus={articleCardFocus(a)} className="article-feed-cover" />
        ) : (
          <div className="article-feed-fallback" aria-hidden>{(post.title || '아').slice(0, 1)}</div>
        )}
      </div>
    </article>
  )
}
