import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { getUserState } from '@/lib/auth'
import { getArticle, getArticleSharePreviewCached as getArticleSharePreview, listArticleComments } from '@/lib/data/articles'
import { SITE_ORIGIN } from '@/lib/invite-share'
import { shareCanonicalUrl, shareMeta } from '@/lib/share-teaser'
import { ArticleByline } from '@/components/articles/article-byline'
import { ArticleMarkdown } from '@/components/articles/article-markdown'
import { ArticleReaderChrome } from '@/components/articles/article-reader-chrome'
import { ArticleActions } from '@/components/articles/article-actions'
import { ArticleComments } from '@/components/articles/article-comments'
import { ArticleOwnerMenu } from '@/components/articles/article-owner-menu'
import { ArticleShareButton } from '@/components/articles/article-share-button'
import { ArticleReadCover } from '@/components/articles/article-framed-image'
import { T } from '@/i18n/t'
import { getT } from '@/i18n/server'
import { articleHref, articleSeriesHref, formatReadingTime, isReservedArticleSlug, isPublicArticlePath, articleImageSrc, articleDocumentTitle } from '@/lib/article-rules'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  if (!slug || isReservedArticleSlug(slug)) return { title: articleDocumentTitle('아티클') }
  const preview = await getArticleSharePreview(slug).catch(() => null)
  if (!preview) return { title: articleDocumentTitle('아티클') }
  const url = shareCanonicalUrl(articleHref(preview.slug || slug))
  const title = preview.title || '아티클'
  const description = preview.body || title
  return {
    title: articleDocumentTitle(title),
    description,
    ...shareMeta({
      title,
      description,
      url,
      image: { url: `${SITE_ORIGIN}/og/article/${encodeURIComponent(preview.slug || slug)}`, width: 1200, height: 630, alt: title },
    }),
  }
}

export default async function ArticleReadPage({ params }: Props) {
  const { slug } = await params
  if (!slug || isReservedArticleSlug(slug) || !isPublicArticlePath(`/articles/${slug}`)) notFound()
  const state = await getUserState()
  const signedIn = state.type === 'member'
  const article = await getArticle(slug, { teaser: !signedIn }).catch(() => null)
  if (!article) notFound()
  if (article.canonicalSlug && article.canonicalSlug !== slug) redirect(articleHref(article.canonicalSlug))

  const t = await getT()
  // A140: the share sheet may carry the title only when the link preview does (no PII)
  const sharePreview = article.status === 'published' ? await getArticleSharePreview(article.slug).catch(() => null) : null
  const shareTeaser = sharePreview?.title ?? null
  const member = signedIn ? state.member : null
  const comments = signedIn ? await listArticleComments(article.id).catch(() => []) : []
  const cover = articleImageSrc(article.coverPath)
  const date = article.publishedAt
    ? new Date(article.publishedAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
    : null
  const next = articleHref(article.slug)

  return (
    <ArticleReaderChrome member={member} nextPath={next}>
      <article className="article-read">
        {article.series && (
          <Link href={articleSeriesHref(article.series.slug)} className="article-series-kicker">
            {article.episodeNo ? t('{series} {n}화', { series: article.series.title, n: article.episodeNo }) : article.series.title}
          </Link>
        )}
        <h1 className="article-read-title">{article.title}</h1>
        {article.subtitle && <p className="article-read-sub">{article.subtitle}</p>}
        <div className="article-read-byline">
          <ArticleByline
            author={article.author}
            agent={article.agent}
            href={signedIn ? `/members/${article.author.id}` : next}
            className="article-read-author"
          />
          <span className="text-n-888">
            {date}
            {article.readingSec > 0 ? ` · ${formatReadingTime(article.readingSec, t)}` : ''}
            {article.editedAt ? ` · ${t('수정됨')}` : ''}
          </span>
          {article.status === 'published' && <ArticleShareButton slug={article.slug} teaser={shareTeaser} />}
          {article.isMine && <ArticleOwnerMenu articleId={article.id} slug={article.slug} published={article.status === 'published'} title={article.title} />}
        </div>
        {cover && <ArticleReadCover src={cover} />}
        <div className={`article-read-body${article.truncated ? ' is-truncated' : ''}`}>
          <ArticleMarkdown content={article.body || ''} />
          {article.truncated && (
            <div className="article-read-fade">
              <div className="article-read-cta">
                <p className="article-read-cta-title"><T>가입하고 이어 읽기</T></p>
                <p className="article-read-cta-copy"><T>나머지 본문은 멤버에게만 열려 있어요. 로그인하거나 초대를 요청해 주세요.</T></p>
                <div className="flex flex-wrap gap-2 justify-center">
                  <Link href={`/?next=${encodeURIComponent(next)}`} className="btn btn-primary"><T>로그인</T></Link>
                  <Link href="/join?from=article" className="btn btn-secondary"><T>초대 요청</T></Link>
                </div>
              </div>
            </div>
          )}
        </div>
        {!article.truncated && (
          <ArticleActions
            articleId={article.id}
            seriesId={article.seriesId}
            likeCount={article.likeCount}
            commentCount={article.commentCount}
            likedByMe={Boolean(article.likedByMe)}
            subscribed={Boolean(article.subscribed)}
            isMine={Boolean(article.isMine)}
            signedIn={signedIn}
            title={article.title}
            excerpt={article.subtitle}
            slug={article.slug}
            shareTeaser={shareTeaser}
          />
        )}
        {!article.truncated && <ArticleComments articleId={article.id} initial={comments} signedIn={signedIn} />}
      </article>
    </ArticleReaderChrome>
  )
}
