import { getT } from '@/i18n/server'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('관리 · AI쓰발') }
}

// /admin: on mobile the layout shows the section list; on desktop the dashboard.
export { default } from './overview/page'
