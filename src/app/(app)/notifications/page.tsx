import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Bell, Settings } from 'lucide-react'
import { getUserState } from '@/lib/auth'
import { listNotifications } from '@/lib/data/notifications'
import { NOTIFY_CATEGORIES, parseNotifyCategory } from '@/lib/notifications'
import { NotificationRow } from '@/components/notifications/notification-row'
import { MarkNotificationsRead } from '@/components/notifications/mark-read'
import { ChipBar } from '@/components/chip-bar'
import { Pagination } from '@/components/pagination'
import { T } from '@/i18n/t'
import { getT } from '@/i18n/server'

const PAGE_SIZE = 20

export async function generateMetadata() {
  const t = await getT()
  return { title: t('알림 · AI쓰발') }
}

function href(category: string | null, page = 1) {
  const p = new URLSearchParams()
  if (category) p.set('c', category)
  if (page > 1) p.set('page', String(page))
  const s = p.toString()
  return s ? `/notifications?${s}` : '/notifications'
}

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ c?: string; page?: string }> }) {
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')
  const st = await getT()
  const sp = await searchParams
  const category = parseNotifyCategory(sp.c)
  const page = Math.max(1, Number(sp.page) || 1)
  const data = await listNotifications({ category, offset: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE }).catch(() => null)
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1
  const hasUnread = Boolean(data?.items.some((n) => n.unread))

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
        ) : data.items.length === 0 ? (
          <p className="p-10 text-center text-sm text-n-888">{category ? <T>이 종류의 알림이 아직 없어요.</T> : <T>아직 알림이 없어요. 글을 쓰거나 친구를 만들면 여기로 소식이 와요.</T>}</p>
        ) : (
          <ul className="divide-y divide-n-f0f0f0">
            {data.items.map((n) => (
              <li key={n.id}>
                <NotificationRow n={n} />
              </li>
            ))}
          </ul>
        )}
      </div>
      <Pagination base={href(category)} page={page} totalPages={totalPages} />
      <MarkNotificationsRead category={category} hasUnread={hasUnread} />
    </div>
  )
}
