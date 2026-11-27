import Link from 'next/link'
import { getUserState } from '@/lib/auth'
import { articleEditHref, articleHref, canPublishArticle } from '@/lib/article-rules'
import { listMyArticles } from '@/lib/data/articles'
import { T } from '@/i18n/t'
import { getT } from '@/i18n/server'
import { redirect } from 'next/navigation'

export default async function MyArticlesPage() {
  const state = await getUserState()
  if (state.type !== 'member') redirect('/')
  const mine = await listMyArticles()
  const t = await getT()
  const writer = canPublishArticle(state.member)
  return (
    <div className="page-col">
      <header className="flex items-end justify-between gap-3 mb-4">
        <h1 className="text-xl font-semibold text-n-111"><T>내 아티클</T></h1>
        <Link href="/articles/new" className="btn btn-primary btn-sm"><T>새 아티클</T></Link>
      </header>
      {!writer && <p className="text-sm text-n-888 mb-4"><T>초고는 저장할 수 있어요. 발행하려면 작가 권한이 필요해요.</T></p>}
      {mine.articles.length === 0 && mine.series.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="font-medium text-n-333"><T>아직 쓴 아티클이 없어요.</T></p>
        </div>
      ) : (
        <ul className="card divide-y divide-n-eee">
          {mine.articles.map((a) => (
            <li key={a.id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <Link href={a.status === 'published' ? articleHref(a.slug) : articleEditHref(a.id)} className="font-medium text-n-111 truncate block">
                  {a.title}
                </Link>
                <p className="text-xs text-n-888">
                  {a.status === 'published' ? t('발행됨') : a.status === 'hidden' ? t('숨김') : t('초고')}
                  {a.series ? ` · ${a.series.title}` : ''}
                </p>
              </div>
              <Link href={articleEditHref(a.id)} className="btn btn-secondary btn-sm"><T>수정</T></Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
