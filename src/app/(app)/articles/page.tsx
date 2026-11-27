import Link from 'next/link'
import { ARTICLE_BROWSE_TABS, canPublishArticle, parseArticleBrowseTab } from '@/lib/article-rules'
import { getUserState } from '@/lib/auth'
import { listArticles } from '@/lib/data/articles'
import { ArticleCardView, SeriesCardView } from '@/components/articles/article-card'
import type { ArticleCard, ArticleSeriesBrief } from '@/lib/data/articles'
import { T } from '@/i18n/t'
import { getT } from '@/i18n/server'

export default async function ArticlesBrowsePage({ searchParams }: { searchParams: Promise<{ tab?: string; page?: string }> }) {
  const state = await getUserState()
  const member = state.type === 'member' ? state.member : null
  const sp = await searchParams
  const tab = parseArticleBrowseTab(sp.tab)
  const page = Math.max(1, Number(sp.page) || 1)
  const t = await getT()
  const data = await listArticles(tab, page)
  const writer = canPublishArticle(member)
  return (
    <div className="page-col">
      <header className="article-page-head">
        <div className="article-page-lead">
          <h1 className="text-xl font-semibold text-n-111"><T>아티클</T></h1>
          <p className="article-page-dek"><T>긴 글을 천천히 읽고, 연재로 이어 갑니다.</T></p>
        </div>
        <div className="article-page-actions">
          <Link href="/articles/mine" className="btn btn-secondary btn-sm"><T>내 아티클</T></Link>
          {writer ? (
            <Link href="/articles/new" className="btn btn-primary btn-sm"><T>새 아티클</T></Link>
          ) : (
            <span className="btn btn-secondary btn-sm opacity-70" title={t('작가 권한이 필요해요.')}><T>새 아티클</T></span>
          )}
        </div>
      </header>
      {!writer && (
        <p className="text-sm text-n-888 mb-4"><T>초고는 누구나 쓸 수 있어요. 발행은 작가 권한이 있는 멤버만 할 수 있어요.</T> <Link href="/articles/new" className="body-link"><T>초고 쓰기</T></Link></p>
      )}
      <nav className="flex gap-2 mb-4" aria-label={t('아티클 보기')}>
        {ARTICLE_BROWSE_TABS.map((x) => (
          <Link key={x.id} href={x.id === 'latest' ? '/articles' : `/articles?tab=${x.id}`} className={`tag-chip ${tab === x.id ? 'on' : ''}`} aria-current={tab === x.id ? 'page' : undefined}>
            {t(x.label)}
          </Link>
        ))}
      </nav>
      {data.items.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="font-medium text-n-333"><T>아직 아티클이 없어요.</T></p>
        </div>
      ) : tab === 'series' ? (
        <div className="article-grid">
          {(data.items as ArticleSeriesBrief[]).map((s) => (
            <SeriesCardView key={s.id} series={s} />
          ))}
        </div>
      ) : (
        <div className="article-grid">
          {(data.items as ArticleCard[]).map((a) => (
            <ArticleCardView key={a.id} article={a} />
          ))}
        </div>
      )}
    </div>
  )
}
