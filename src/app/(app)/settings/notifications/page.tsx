import Link from 'next/link'
import { SubPageHeader } from '@/components/shell/sub-nav-layout'
import { NotificationSettings } from './notification-settings'
import { PushSettings } from '@/components/push/push-control'
import { getNotifyPrefs } from '@/lib/data/notifications'
import { DEFAULT_PREFS } from '@/lib/notifications'
import { msg } from '@/i18n/translate'
import { getT } from '@/i18n/server'
import { T } from '@/i18n/t'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('알림 설정 · AI쓰발') }
}

export default async function NotificationSettingsPage() {
  const prefs = await getNotifyPrefs().catch(() => DEFAULT_PREFS)
  return (
    <>
      <SubPageHeader title={msg('알림')} description={msg('끈 종류는 새 알림이 쌓이지 않아요. 알림은 상단 종 아이콘에서 볼 수 있어요.')} />
      <div className="mb-3"><PushSettings /></div>
      <NotificationSettings initial={prefs} />
      <p className="text-xs text-n-888 px-1 mt-3">
        <Link href="/notifications" className="text-c-06c"><T>알림 보기</T> ›</Link>
      </p>
    </>
  )
}
