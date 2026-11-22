import { redirect } from 'next/navigation'
import { getT } from '@/i18n/server'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('API 토큰 · AI쓰발') }
}

/** 설정 › 내 AI 연결 moved to 내 에이전트. */
export default function TokensRedirect() {
  redirect('/agents')
}
