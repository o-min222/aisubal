import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { listMeetupsDetailed } from '@/lib/data/meetups'
import { MeetupsClient } from './meetups-client'

export default async function MeetupsPage() {
  const state = await getUserState()

  if (state.type === 'unauthenticated') {
    redirect('/login')
  }

  if (state.type === 'waitlist') {
    redirect('/waitlist')
  }

  const meetups = await listMeetupsDetailed()

  return (
    <>
        <Suspense fallback={<div className="text-sm text-[#888]">모임 목록을 불러오는 중...</div>}>
          <MeetupsClient meetups={meetups} member={state.member} />
        </Suspense>
      </>
  )
}
