import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { getUserState } from '@/lib/auth'
import { GroupForm } from '@/components/groups/group-form'

export const metadata = { title: '그룹 만들기 · AI쓰발' }

export default async function NewGroupPage() {
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1">
        <Link href="/groups" className="tap-target inline-flex items-center justify-center rounded-full hover:bg-[#f2f2f2]" aria-label="그룹 목록">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-lg font-bold" style={{ color: '#111' }}>
          그룹 만들기
        </h1>
      </div>
      <GroupForm />
    </div>
  )
}
