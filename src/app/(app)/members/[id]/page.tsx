import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Settings } from 'lucide-react'
import { getUserState } from '@/lib/auth'
import { getMemberById } from '@/lib/data/members'
import { listFeedTimeline } from '@/lib/data/feed'
import { getProfileStats } from '@/lib/data/shell'
import { isFeedId } from '@/lib/feed-ids'
import { UserAvatar } from '@/components/user-avatar'
import { PostCard } from '@/components/timeline/post-card'

export const metadata = { title: '프로필 · AI쓰발' }

export default async function MemberProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')
  const viewer = state.member
  const { id: rawId } = await params
  const id = rawId === 'me' ? viewer.id : rawId
  if (id !== viewer.id && !isFeedId(id)) notFound()
  const isMe = id === viewer.id

  const member = isMe ? viewer : await getMemberById(id)
  if (!member || !member.signup_completed_at) notFound()

  // Other members' pages only list real-name posts: nickname posts stay unlinkable.
  const [posts, stats] = await Promise.all([
    listFeedTimeline(viewer.id, { authorId: member.id, includeNickname: isMe, limit: 50 }),
    isMe ? getProfileStats(viewer) : Promise.resolve(null),
  ])

  return (
    <div className="space-y-3">
      <section className="card overflow-hidden">
        <div className="profile-card-cover h-20" aria-hidden />
        <div className="px-4 pb-4 -mt-8 flex items-end justify-between gap-3">
          <span className="rounded-full ring-4 ring-white">
            <UserAvatar id={member.id} name={member.display_name} avatarUrl={member.avatar_url} size="lg" />
          </span>
          {isMe && (
            <Link href="/settings" className="btn btn-secondary btn-sm min-h-[40px] rounded-full">
              <Settings className="w-4 h-4" /> 프로필 편집
            </Link>
          )}
        </div>
        <div className="px-4 pb-4">
          <h1 className="text-xl font-bold text-[#111]">{member.display_name}</h1>
          {isMe && member.nickname && <div className="text-sm text-[#888]">별명 @{member.nickname} (나만 보여요)</div>}
          {member.bio && <p className="text-sm text-[#555] mt-2 whitespace-pre-wrap">{member.bio}</p>}
          {stats && (
            <div className="flex gap-5 mt-3 text-sm">
              <span><b className="text-[#111]">{stats.posts}</b> <span className="text-[#777]">게시물</span></span>
              <span><b className="text-[#111]">{stats.likes}</b> <span className="text-[#777]">받은 좋아요</span></span>
              <Link href="/invites"><b className="text-[#111]">{stats.invitesLeft}</b> <span className="text-[#777]">남은 초대</span></Link>
            </div>
          )}
        </div>
      </section>

      <h2 className="text-sm font-semibold text-[#111] px-1">{isMe ? '내 글' : '글'}</h2>
      {posts.length === 0 ? (
        <div className="card p-8 text-center text-sm text-[#888]">아직 글이 없어요.</div>
      ) : (
        <div className="timeline-list">
          {posts.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              href={`/posts/${p.id}`}
              replyHref={`/posts/${p.id}`}
              likeEndpoint={`/api/feed/${p.id}/like`}
              likersEndpoint={`/api/feed/${p.id}/likers`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
