import { notFound, redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { canPublishArticle } from '@/lib/article-rules'
import { getArticleById, listMyArticles } from '@/lib/data/articles'
import { ArticleEditor } from '@/components/articles/article-editor'
import { T } from '@/i18n/t'

export default async function EditArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const state = await getUserState()
  if (state.type !== 'member') redirect('/')
  const { id } = await params
  const article = await getArticleById(id)
  if (!article || !article.isMine) notFound()
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
