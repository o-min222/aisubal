import { MessageCircle } from 'lucide-react'
import { getMember } from '@/lib/auth'
import { getFeedThread } from '@/lib/data/feed'
import { PostThreadView } from '@/components/detail/post-thread-view'
import { T } from '@/i18n/t'

/** A29: the 모임's comment thread — where place, time and what to bring get worked out. */
export async function MoimThread({ moimId, postId, reply }: { moimId: string; postId: string; reply?: string }) {
  const member = await getMember()
  const thread = member ? await getFeedThread(postId, member.id).catch(() => null) : null
  if (!member || !thread) return null
  return (
    <div className="moim-thread" id="moim-thread">
      <PostThreadView
        thread={thread}
        member={member}
        reply={reply}
        variant="pane"
        pageHref={`/moim/${moimId}`}
        rootNode={
          <h2 className="moim-thread-title">
            <MessageCircle className="w-3 h-3" aria-hidden /> <T>모임 이야기</T>
          </h2>
        }
        meta={<span><T>장소·시간·준비물은 여기 댓글로 정해요</T></span>}
      />
    </div>
  )
}
