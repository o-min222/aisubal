import Link from 'next/link'
import type { ArticleCard, ArticleSeriesBrief } from '@/lib/data/articles'
import { T } from '@/i18n/t'
import { getT } from '@/i18n/server'
import { ArticleByline } from '@/components/articles/article-byline'
import { articleHref, articleSeriesHref, formatReadingTime, articleImageSrc, articleCardImagePath } from '@/lib/article-rules'

function metaLine(a: ArticleCard, t: (s: string, v?: Record<string, string | number>) => string) {
  const parts: string[] = []
  if (a.series && a.episodeNo) parts.push(t('{series} {n}화', { series: a.series.title, n: a.episodeNo }))
  else if (a.series) parts.push(a.series.title)
  if (a.readingSec) parts.push(formatReadingTime(a.readingSec, t))
  return parts.join(' · ')
}

/** Compact card for /articles browse, profile, feed, and dashboard. */
export async function ArticleCardView({ article, compact = false }: { article: ArticleCard; compact?: boolean }) {
  const t = await getT()
  const href = articleHref(article.slug)
  // A136: thumbnail, then cover, then the first body image, then the letter
  const cover = articleImageSrc(articleCardImagePath(article))
  const meta = metaLine(article, t)
  return (
    <article className={`article-card${compact ? ' article-card-compact' : ''}`}>
      <Link href={href} className="article-card-link">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="article-card-cover" />
        ) : (
          <div className="article-card-fallback" aria-hidden>
            <span>{article.title.slice(0, 1)}</span>
          </div>
        )}
        <div className="article-card-body">
          {meta && <p className="article-card-meta">{meta}</p>}
          <h3 className="article-card-title">{article.title}</h3>
          {article.subtitle && <p className="article-card-sub">{article.subtitle}</p>}
          <p className="article-card-foot">
            <span className="article-card-author">
              <ArticleByline author={article.author} agent={article.agent} />
            </span>
            <span className="text-n-888">
              <T s="좋아요 {likes} · 댓글 {comments}" vars={{ likes: article.likeCount, comments: article.commentCount }} />
            </span>
          </p>
        </div>
      </Link>
    </article>
  )
}

export async function SeriesCardView({ series }: { series: ArticleSeriesBrief }) {
  const t = await getT()
  const cover = articleImageSrc(series.coverPath)
  return (
    <article className="article-card">
      <Link href={articleSeriesHref(series.slug)} className="article-card-link">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="article-card-cover" />
        ) : (
          <div className="article-card-fallback" aria-hidden>
            <span>{series.title.slice(0, 1)}</span>
          </div>
        )}
        <div className="article-card-body">
          <p className="article-card-meta"><T>연재</T></p>
          <h3 className="article-card-title">{series.title}</h3>
          {series.description && <p className="article-card-sub">{series.description}</p>}
          <p className="article-card-foot text-n-888">
            {t('{n}편', { n: series.episodeCount })}
            {series.author?.name ? ` · ${series.author.name}` : ''}
          </p>
        </div>
      </Link>
    </article>
  )
}
