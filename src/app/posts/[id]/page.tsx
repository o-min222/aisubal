import { redirect, notFound } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { Header } from '@/components/header'
import { PostDetailClient } from './post-detail-client'
import { getPost } from '@/lib/data/posts'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function PostDetailPage({ params }: PageProps) {
  const { id } = await params
  const state = await getUserState()

  if (state.type === 'unauthenticated') {
    redirect('/login')
  }

  if (state.type === 'waitlist') {
    redirect('/waitlist')
  }

  const post = await getPost(id)

  if (!post) {
    notFound()
  }

  return (
    <div className="min-h-screen bg-[#f7f7f7]">
      <Header member={state.member} />
      <main className="container-main page-main">
        <PostDetailClient post={post} member={state.member} />
      </main>
    </div>
  )
}
