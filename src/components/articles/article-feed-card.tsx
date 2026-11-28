import Link from 'next/link'
import type { TimelinePost } from '@/components/timeline/types'
import { T } from '@/i18n/t'
import { tx } from '@/i18n/client'
import { ArticleByline } from '@/components/articles/article-byline'
import { articleHref, formatReadingTime, articleImageSrc } from '@/lib/article-rules'

/** Compact home-feed card. Tap opens the reading view; likes/comments are the article's. */
export function ArticleFeedCard({ post }: { post: TimelinePost }) {
  const a = post.article
  if (!a) return null
  const href = articleHref(a.slug)
  const cover = articleImageSrc(a.coverPath)
  const series = a.seriesTitle && a.episodeNo
    ? tx('{series} {n}화', { series: a.seriesTitle, n: a.episodeNo })
    : a.seriesTitle
  return (
    <article className="article-feed-card">
      <Link href={href} className="article-feed-link">
        <div className="article-feed-copy">
          <p className="article-feed-kind"><T>아티클</T>{series ? ` · ${series}` : ''}</p>
          <h3 className="article-feed-title">{post.title}</h3>
          {a.subtitle && <p className="article-feed-sub">{a.subtitle}</p>}
          <p className="article-feed-meta">
            <ArticleByline
              author={{ id: post.author.id, name: post.author.name, handle: post.author.handle ?? null, avatarUrl: post.author.avatarUrl ?? null }}
              agent={a.agent}
            />
            {a.readingSec > 0 && <span>· {formatReadingTime(a.readingSec, (s, v) => tx(s, v))}</span>}
            <span>· {tx('좋아요 {likes} · 댓글 {comments}', { likes: post.likeCount, comments: post.replyCount })}</span>
          </p>
        </div>
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="article-feed-cover" />
        ) : (
          <div className="article-feed-fallback" aria-hidden>{(post.title || '아').slice(0, 1)}</div>
        )}
      </Link>
    </article>
  )
}
