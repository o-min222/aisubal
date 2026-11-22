import { redirect, notFound } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { getToolboxEntry } from '@/lib/data/toolbox'
import { getPost } from '@/lib/data/posts'
import { getToolboxAiRating } from '@/lib/data/agora'
import { getProductDetails } from '@/lib/data/products'
import { getMockLaunchEntry, getToolUsers } from '@/lib/data/tools'
import type { ToolboxEntryDetails } from '@/lib/data/types'
import { compatSummary } from '@/lib/toolbox-rules'
import { ToolUsersCard } from '@/components/tools/tool-users'
import { LaunchSection } from '@/components/tools/launch-section'
import { ToolboxDetailClient } from './toolbox-detail-client'

interface PageProps {
  params: Promise<{ id: string }>
}

async function loadEntry(id: string): Promise<ToolboxEntryDetails | null> {
  const entry = await getToolboxEntry(id)
  if (entry) return entry
  const launch = await getMockLaunchEntry(id) // DEV only: launches live in the mock product store
  return launch
    ? { ...launch, mentions: [], reviews: [], compat: compatSummary([], launch.id) }
    : null
}

export default async function ToolDetailPage({ params }: PageProps) {
  const { id } = await params
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')

  const entry = await loadEntry(decodeURIComponent(id))
  if (!entry) notFound()

  const [mentionPostsRaw, aiRating, usage, launch] = await Promise.all([
    Promise.all(
      entry.mentions.map(async (m) => {
        const post = await getPost(m.post_id)
        if (!post) return null
        return { id: post.id, title: post.title, created_at: post.created_at, url: m.url }
      })
    ),
    getToolboxAiRating(entry.id, state.member.id).catch(() => ({ avg: 0, count: 0, latest: [] })),
    getToolUsers(entry.id, state.member.id).catch(() => ({ count: entry.user_count ?? 0, users: [], usedByMe: false })),
    entry.product_id ? getProductDetails(entry.product_id, state.member.id).catch(() => null) : Promise.resolve(null),
  ])
  const mentionPosts = mentionPostsRaw.filter((x): x is NonNullable<typeof x> => Boolean(x))

  return (
    <ToolboxDetailClient
      entry={entry}
      mentionPosts={mentionPosts}
      member={state.member}
      aiRating={aiRating}
      usersSlot={<ToolUsersCard entryId={entry.id} usage={usage} />}
      launchSlot={launch ? <LaunchSection product={launch} /> : null}
    />
  )
}
