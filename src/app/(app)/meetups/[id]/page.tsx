import { redirect, notFound } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { getMeetupDetails } from '@/lib/data/meetups'
import { listMembers } from '@/lib/data/members'
import { MeetupDetailClient } from './meetup-detail-client'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function MeetupDetailPage({ params }: PageProps) {
  const { id } = await params
  const state = await getUserState()

  if (state.type === 'unauthenticated') {
    redirect('/login')
  }

  if (state.type === 'waitlist') {
    redirect('/waitlist')
  }

  const [meetup, members] = await Promise.all([
    getMeetupDetails(id),
    listMembers(),
  ])
  if (!meetup) {
    notFound()
  }

  return (
    <>
        <MeetupDetailClient
          initialMeetup={meetup}
          member={state.member}
          members={members}
        />
      </>
  )
}
