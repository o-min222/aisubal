import { getUserState } from '@/lib/auth'
import { canPublishArticle } from '@/lib/article-rules'
import { listMyArticles } from '@/lib/data/articles'
import { ArticleEditor } from '@/components/articles/article-editor'
import { T } from '@/i18n/t'
import { redirect } from 'next/navigation'

export default async function NewArticlePage() {
  const state = await getUserState()
  if (state.type !== 'member') redirect('/')
  const mine = await listMyArticles()
  return (
    <div className="page-col">
      <h1 className="sr-only"><T>새 아티클</T></h1>
      <ArticleEditor initial={null} series={mine.series} canPublish={canPublishArticle(state.member)} />
    </div>
  )
}
