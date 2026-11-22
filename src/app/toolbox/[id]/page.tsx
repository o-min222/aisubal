import { redirect, notFound } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { Header } from '@/components/header'
import { getToolboxEntry } from '@/lib/data/toolbox'
import { getPost } from '@/lib/data/posts'
import { ToolboxDetailClient } from './toolbox-detail-client'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ToolboxDetailPage({ params }: PageProps) {
  const { id } = await params
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')

  const entry = await getToolboxEntry(id)
  if (!entry) notFound()

  const mentionPosts = (
    await Promise.all(
      entry.mentions.map(async (m) => {
        const post = await getPost(m.post_id)
        if (!post) return null
        return { id: post.id, title: post.title, created_at: post.created_at, url: m.url }
      })
    )
  ).filter((x): x is NonNullable<typeof x> => Boolean(x))

  return (
    <div className="min-h-screen bg-[#f7f7f7]">
      <Header member={state.member} />
      <main className="container-main page-main">
        <ToolboxDetailClient
          entry={entry}
          mentionPosts={mentionPosts}
          member={state.member}
        />
      </main>
    </div>
  )
}
