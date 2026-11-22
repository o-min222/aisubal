import { getT } from '@/i18n/server'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('설정 · AI쓰발') }
}

// /settings: on mobile the layout shows the section list (drill-down);
// on desktop the first section (계정) is shown next to the list.
export { default } from './account/page'
