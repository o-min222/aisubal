import { redirect } from 'next/navigation'

/** Old address of the connect wizard → 내 에이전트 › 에이전트 연결 (query kept). */
export default async function ConnectRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) if (typeof v === 'string') q.set(k, v)
  redirect(`/agents/connect${q.size ? `?${q}` : ''}`)
}
