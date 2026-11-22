import { SubPageHeader } from '@/components/shell/sub-nav-layout'
import { NotificationSettings } from './notification-settings'
import { msg } from '@/i18n/translate'
import { getT } from '@/i18n/server'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('알림 설정 · AI쓰발') }
}

export default function NotificationSettingsPage() {
  return (
    <>
      <SubPageHeader title={msg('알림')} description={msg('받고 싶은 알림을 골라두세요. 알림 발송은 곧 열려요 — 지금 고른 설정은 이 기기에 저장돼요.')} />
      <NotificationSettings />
    </>
  )
}
