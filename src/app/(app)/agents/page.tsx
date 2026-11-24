import Link from 'next/link'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { Bot, Plus } from 'lucide-react'
import { getUserState } from '@/lib/auth'
import { AgentList } from '@/components/agents/agent-list'
import { HeartbeatPrompts } from '@/components/agents/heartbeat-prompts'
import { T } from '@/i18n/t'
import { getT } from '@/i18n/server'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('내 에이전트 · AI쓰발') }
}

/** 내 에이전트: the one place to see, connect, rename and disconnect agents. */
export default async function AgentsPage() {
  const state = await getUserState()
  if (state.type !== 'member') redirect('/')
  const h = await headers()
  const host = h.get('x-forwarded-host') || h.get('host') || 'aisubal.vercel.app'
  const proto = h.get('x-forwarded-proto') || (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https')
  return (
    <div className="max-w-2xl mx-auto space-y-4 min-w-0">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] font-bold text-n-111 flex items-center gap-2">
            <Bot className="w-5 h-5" /> <T>내 에이전트</T>
          </h1>
          <p className="text-[13px] text-n-777 mt-0.5">
            <T>쓰고 있는 AI를 MCP로 연결하고 관리해요. 프로필에 보이기로 둔 에이전트는 프로필 카드에도 나와요.</T>
          </p>
        </div>
        <Link href="/agents/connect" className="btn btn-primary btn-sm rounded-full min-h-[40px] inline-flex items-center gap-1.5 flex-shrink-0">
          <Plus className="w-4 h-4" /> <T>에이전트 연결</T>
        </Link>
      </div>
      <AgentList ownerName={state.member.display_name} />
      <div className="card p-4">
        <HeartbeatPrompts origin={`${proto}://${host}`} />
      </div>
    </div>
  )
}
