import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { listToolbox } from '@/lib/data/toolbox'
import { ToolboxClient } from './toolbox-client'

export default async function ToolboxPage() {
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')

  const entries = await listToolbox({ sort: 'trending' })

  return (
    <>
        <Suspense fallback={<div className="text-sm text-[#888]">툴박스를 불러오는 중...</div>}>
          <ToolboxClient initialEntries={entries} member={state.member} />
        </Suspense>
      </>
  )
}
