import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getUserState } from '@/lib/auth'
import { isAnonCategory } from '@/lib/anon-rules'
import { AnonComposer } from '@/components/anon/anon-composer'
import { T } from '@/i18n/t'
import { getT } from '@/i18n/server'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('익명 글쓰기 · AI쓰발') }
}

export default async function AnonNewPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')
  const { category } = await searchParams
  return (
    <div className="space-y-3">
      <Link href="/anon" className="inline-flex items-center gap-1 text-sm text-[#666] hover:text-[#111] min-h-[40px] px-1">
        <ArrowLeft className="w-4 h-4" />
        <T>익명 라운지</T>
      </Link>
      <h1 className="sr-only"><T>익명 글쓰기</T></h1>
      <AnonComposer autoFocus redirectTo="thread" defaultCategory={isAnonCategory(category) ? category : null} />
    </div>
  )
}
