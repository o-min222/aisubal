import { composerIdentity } from '@/lib/composer-identity'
import { toolHref } from '@/lib/tool-rules'
import { getToolboxEntry } from '@/lib/data/toolbox'
import { getPost } from '@/lib/data/posts'
import { getToolboxAiRating } from '@/lib/data/agora'
import { getProductDetails } from '@/lib/data/products'
import { getMockLaunchEntry, getToolUsers, myLikedToolIds } from '@/lib/data/tools'
import { getProfileStack } from '@/lib/data/profile-stack'
import { getToolProvenance } from '@/lib/data/tool-submissions'
import type { ToolboxEntryDetails } from '@/lib/data/types'
import type { Member } from '@/lib/supabase/types'
import { compatSummary } from '@/lib/toolbox-rules'
import { LaunchSection } from '@/components/tools/launch-section'
import { ToolboxDetailClient } from '@/app/(app)/gallery/[id]/toolbox-detail-client'

export async function loadToolEntry(id: string): Promise<ToolboxEntryDetails | null> {
  const entry = await getToolboxEntry(id)
  if (entry) return entry
  const launch = await getMockLaunchEntry(id) // DEV only: launches live in the mock product store
  return launch ? { ...launch, mentions: [], reviews: [], compat: compatSummary([], launch.id) } : null
}

/** Tool detail. Used by /gallery/[id] and the 툴 reading pane. */
export async function ToolDetailView({ entry, member, variant = 'page' }: { entry: ToolboxEntryDetails; member: Member; variant?: 'page' | 'pane' }) {
  const [mentionPostsRaw, aiRating, usage, launch, prov, liked] = await Promise.all([
    Promise.all(
      entry.mentions.map(async (m) => {
        const post = await getPost(m.post_id)
        if (!post) return null
        return { id: post.id, title: post.title, created_at: post.created_at, url: m.url }
      })
    ),
    getToolboxAiRating(entry.id, member.id).catch(() => ({ avg: 0, count: 0, latest: [] })),
    getToolUsers(entry.id, member.id).catch(() => ({ count: entry.user_count ?? 0, users: [], usedByMe: false })),
    entry.product_id ? getProductDetails(entry.product_id, member.id).catch(() => null) : Promise.resolve(null),
    getToolProvenance(entry.id).catch(() => null),
    myLikedToolIds(member.id).catch(() => new Set<string>()),
  ])
  // each person's AI stack as compact chips (visibility enforced by profile_stack)
  const stacks = Object.fromEntries(
    await Promise.all(
      usage.users.slice(0, 12).map(async (u) => {
        const st = await getProfileStack(u.id, member.id).catch(() => null)
        return [u.id, (st?.ai?.items ?? []).map((i) => ({ label: i.label, iconUrl: i.entry?.iconUrl ?? null }))] as const
      }),
    ),
  )
  const toolUrl = `https://aisubal.vercel.app${toolHref(entry)}`
  const mentionPosts = mentionPostsRaw.filter((x): x is NonNullable<typeof x> => Boolean(x))
  return (
    <ToolboxDetailClient
      entry={entry}
      mentionPosts={mentionPosts}
      member={member}
      aiRating={aiRating}
      variant={variant}
      likedByMe={liked.has(entry.id)}
      provenance={
        prov
          ? {
              by: prov.submittedBy,
              at: prov.submittedAt,
              approvedBy: prov.approvedBy && prov.approvedAt && !prov.approvedBy.startsWith('바로 공개') ? prov.approvedBy : null,
              approvedAt: prov.approvedAt ?? null,
            }
          : null
      }
      people={{ usage, stacks, tool: { name: entry.name, url: toolUrl }, me: composerIdentity(member) }}
      launchSlot={launch ? <LaunchSection product={launch} /> : null}
    />
  )
}
