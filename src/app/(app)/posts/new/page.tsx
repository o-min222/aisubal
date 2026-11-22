import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Paperclip } from 'lucide-react'
import { getUserState, getNicknameUnlockState } from '@/lib/auth'
import { composerIdentity } from '@/lib/composer-identity'
import { Composer } from '@/components/feed/composer'
import { T } from '@/i18n/t'
import { getT } from '@/i18n/server'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('새 글 · AI쓰발') }
}

export default async function NewPostPage() {
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')
  const unlock = await getNicknameUnlockState()

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-bold text-n-111"><T>새 글</T></h1>
      <Composer me={composerIdentity(state.member, unlock.unlocked)} autoFocus className="card p-4" />
      <Link href="/posts/new/asset" className="flex items-center gap-2 text-sm text-n-555 px-1 min-h-[44px]">
        <Paperclip className="w-4 h-4" /> <T>프롬프트·MCP 설정 같은 AI 에셋과 함께 올리기</T>
      </Link>
    </div>
  )
}
