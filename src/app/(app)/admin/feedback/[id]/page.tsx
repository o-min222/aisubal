import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { getUserState } from '@/lib/auth'
import { adminGetFeedback } from '@/lib/data/feedback'
import { SubPageHeader } from '@/components/shell/sub-nav-layout'
import { msg } from '@/i18n/translate'
import { getT } from '@/i18n/server'
import { FeedbackDetail } from './feedback-detail'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('관리 · 피드백 · AI쓰발') }
}

export default async function AdminFeedbackItemPage({ params }: { params: Promise<{ id: string }> }) {
  const state = await getUserState()
  if (state.type !== 'member' || !state.member.is_admin) redirect('/feed')
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const item = await adminGetFeedback(id).catch(() => null)
  if (!item) notFound()
  const t = await getT()
  const { screenshotPath: _p, ...rest } = item
  return (
    <>
      <Link href="/admin/feedback" className="inline-flex items-center gap-1 text-sm text-n-555 mb-2 min-h-[36px]">
        <ChevronLeft className="w-4 h-4" /> {t('피드백 목록')}
      </Link>
      <SubPageHeader title={msg('화면 피드백')} />
      <FeedbackDetail initial={rest} />
    </>
  )
}
