import { SubPageHeader } from '@/components/shell/sub-nav-layout'
import { AppSetup } from '@/components/app-setup/app-setup'
import { PushSettings } from '@/components/push/push-control'
import { msg } from '@/i18n/translate'
import { getT } from '@/i18n/server'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('모바일 앱 · AI쓰발') }
}

export default function AppSettingsPage() {
  return (
    <>
      <SubPageHeader title={msg('모바일 앱')} description={msg('홈 화면에 추가하면 앱처럼 열려요. PC에서는 QR로 폰에 바로 보낼 수 있어요.')} />
      <AppSetup next="/settings/app" mode="settings" />
      <div className="mt-3"><PushSettings /></div>
    </>
  )
}
