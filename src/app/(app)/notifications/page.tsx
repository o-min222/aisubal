import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Bell, Settings } from 'lucide-react'
import { getUserState } from '@/lib/auth'
import { NOTIFY_CATEGORIES, parseNotifyCategory } from '@/lib/notifications'
import { MarkNotificationsRead } from '@/components/notifications/mark-read'
import { ChipBar } from '@/components/chip-bar'
import { InfiniteList } from '@/components/infinite/infinite-list'
import { loadNotificationChunk } from '@/app/actions/notifications'
import { T } from '@/i18n/t'
import { getT } from '@/i18n/server'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('알림 · AI쓰발') }
}

function href(category: string | null) {
  return category ? `/notifications?c=${category}` : '/notifications'
}

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')
  const st = await getT()
  const sp = await searchParams
  const category = parseNotifyCategory(sp.c)
  const data = await loadNotificationChunk(category, 1).catch(() => null)
  const hasUnread = Boolean(data && data.unread > 0)

  return (
    <div className="max-w-2xl mx-auto space-y-3">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold flex items-center gap-2 text-n-111">
          <Bell className="w-6 h-6" /> <T>알림</T>
        </h1>
        <Link href="/settings/notifications" className="ml-auto tap-target inline-flex items-center justify-center rounded-full text-n-666 hover:bg-n-f2f2f2" aria-label={st('알림 설정')} title={st('알림 설정')}>
          <Settings className="w-5 h-5" />
        </Link>
      </div>
      <div className="card overflow-hidden">
        <ChipBar as="nav" label={st('알림 종류')} className="px-3 pt-3 pb-2">
          <Link href={href(null)} scroll={false} aria-current={!category ? 'page' : undefined} className={`filter-chip whitespace-nowrap ${!category ? 'on' : ''}`}>
            <T>전체</T>
          </Link>
          {NOTIFY_CATEGORIES.map((c) => (
            <Link key={c.id} href={href(c.id)} scroll={false} aria-current={category === c.id ? 'page' : undefined} className={`filter-chip whitespace-nowrap ${category === c.id ? 'on' : ''}`}>
              <T>{c.label}</T>
            </Link>
          ))}
        </ChipBar>
        {!data ? (
          <p className="p-8 text-center text-sm text-n-888"><T>알림을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</T></p>
        ) : data.empty ? (
          <p className="p-10 text-center text-sm text-n-888">{category ? <T>이 종류의 알림이 아직 없어요.</T> : <T>아직 알림이 없어요. 글을 쓰거나 친구를 만들면 여기로 소식이 와요.</T>}</p>
        ) : (
          <InfiniteList key={category ?? 'all'} hasMore={data.hasMore} load={loadNotificationChunk.bind(null, category)} storageKey={href(category)}>
            {data.nodes}
          </InfiniteList>
        )}
      </div>
      <MarkNotificationsRead category={category} hasUnread={hasUnread} />
    </div>
  )
}
