import { notFound, redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { canPublishArticle, articleEditHref } from '@/lib/article-rules'
import { getArticle, getArticleById, listMyArticles } from '@/lib/data/articles'
import { ArticleEditor } from '@/components/articles/article-editor'
import { T } from '@/i18n/t'

export default async function EditArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const state = await getUserState()
  if (state.type !== 'member') redirect('/')
  const { slug } = await params
  const article = (await getArticle(slug)) ?? (await getArticleById(slug))
  if (!article || !article.isMine) notFound()
  if (article.slug && article.slug !== slug) redirect(articleEditHref(article.slug))
  const mine = await listMyArticles()
  return (
    <div className="page-col">
      <h1 className="sr-only"><T>아티클 수정</T></h1>
      <ArticleEditor
        initial={{
          id: article.id,
          title: article.title,
          subtitle: article.subtitle ?? '',
          body: article.body ?? '',
          coverPath: article.coverPath,
          seriesId: article.seriesId,
          episodeNo: article.episodeNo ? String(article.episodeNo) : '',
          status: article.status,
          slug: article.slug,
        }}
        series={mine.series}
        canPublish={canPublishArticle(state.member)}
      />
    </div>
  )
}
