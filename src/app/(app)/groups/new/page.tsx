import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { getUserState } from '@/lib/auth'
import { CreateGroupForm } from '@/components/groups/group-form'
import { T } from '@/i18n/t'
import { getT } from '@/i18n/server'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('그룹 만들기 · AI쓰발') }
}

export default async function NewGroupPage() {
  const st = await getT()
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1">
        <Link href="/groups" className="tap-target inline-flex items-center justify-center rounded-full hover:bg-n-f2f2f2" aria-label={st('그룹 목록')}>
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-lg font-bold" style={{ color: 'var(--n-111)' }}>
          <T>그룹 만들기</T>
        </h1>
      </div>
      <CreateGroupForm />
    </div>
  )
}
