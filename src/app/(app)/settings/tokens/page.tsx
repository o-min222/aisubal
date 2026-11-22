import { redirect } from 'next/navigation'

/** 설정 › 내 AI 연결 moved to 내 에이전트. */
export default function TokensRedirect() {
  redirect('/agents')
}
