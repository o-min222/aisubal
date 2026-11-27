import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { getUserState } from '@/lib/auth'
import { getSeries } from '@/lib/data/articles'
import { SubscribeButton } from '@/components/articles/subscribe-button'
import { T } from '@/i18n/t'
import { getT } from '@/i18n/server'
import { UserAvatar } from '@/components/user-avatar'
import { articleHref, articleSeriesHref, articleImageSrc } from '@/lib/article-rules'

export default async function ArticleSeriesPage({ params }: { params: Promise<{ slug: string }> }) {
  const state = await getUserState()
  if (state.type !== 'member') redirect('/')
  const { slug } = await params
  const series = await getSeries(slug)
  if (!series) notFound()
  if (series.canonicalSlug && series.canonicalSlug !== slug) redirect(articleSeriesHref(series.canonicalSlug))
  const t = await getT()
  const cover = articleImageSrc(series.coverPath)
  const episodes = series.episodes ?? []
  return (
    <div className="page-col">
      <header className="article-series-head">
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="article-series-cover" />
        )}
        <div>
          <p className="text-xs text-n-888 mb-1"><T>연재</T></p>
          <h1 className="text-xl font-semibold text-n-111">{series.title}</h1>
          {series.description && <p className="text-sm text-n-666 mt-2">{series.description}</p>}
          <div className="flex items-center gap-3 mt-3">
            {series.author && (
              <Link href={`/members/${series.author.id}`} className="flex items-center gap-2 text-sm">
                <UserAvatar id={series.author.id} name={series.author.name} avatarUrl={series.author.avatarUrl} size="sm" />
                {series.author.name}
              </Link>
            )}
            {!series.isMine && <SubscribeButton seriesId={series.id} initial={Boolean(series.subscribed)} />}
          </div>
        </div>
      </header>
      <h2 className="text-sm font-medium text-n-555 mt-6 mb-2">{t('목차 · {n}편', { n: episodes.length })}</h2>
      <ol className="card divide-y divide-n-eee">
        {episodes.map((a) => (
          <li key={a.id}>
            <Link href={articleHref(a.slug)} className="flex items-baseline justify-between gap-3 p-3">
              <span className="min-w-0">
                {a.episodeNo ? <span className="text-n-888 tabular-nums mr-2">{a.episodeNo}</span> : null}
                <span className="font-medium text-n-111">{a.title}</span>
              </span>
            </Link>
          </li>
        ))}
        {episodes.length === 0 && <li className="p-6 text-center text-sm text-n-888"><T>아직 발행된 편이 없어요.</T></li>}
      </ol>
    </div>
  )
}
