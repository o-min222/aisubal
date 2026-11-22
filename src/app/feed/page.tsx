import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { Header } from '@/components/header'
import {
  listPosts,
  listTrendingPosts,
  upcomingMeetups,
  featuredProducts,
  featuredToolbox,
} from '@/lib/data'
import { FeedClient } from './feed-client'

export default async function FeedPage() {
  const state = await getUserState()

  if (state.type === 'unauthenticated') {
    redirect('/login')
  }

  if (state.type === 'waitlist') {
    redirect('/waitlist')
  }

  const [posts, trending, meetups, products, tools] = await Promise.all([
    listPosts(),
    listTrendingPosts(5),
    upcomingMeetups(3),
    featuredProducts(3, state.member.id),
    featuredToolbox(4),
  ])

  return (
    <div className="min-h-screen bg-[#f7f7f7]">
      <Header member={state.member} />
      <main className="container-main page-main">
        <Suspense fallback={<div className="text-sm text-[#888]">피드를 불러오는 중...</div>}>
          <FeedClient
            member={state.member}
            posts={posts}
            trending={trending}
            meetups={meetups}
            products={products}
            tools={tools}
          />
        </Suspense>
      </main>
    </div>
  )
}
