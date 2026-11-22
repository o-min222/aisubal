import { notFound, redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { getMoim } from '@/lib/data/moim'
import { MoimForm } from '@/components/moim/moim-form'

export default async function EditMoimPage({ params }: { params: Promise<{ id: string }> }) {
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')
  const { id } = await params
  const m = await getMoim(state.member.id, id).catch(() => null)
  if (!m) notFound()
  if (!m.canManage) redirect(`/moim/${id}`)
  return <MoimForm me={{ name: state.member.display_name }} hostGroups={[]} edit={m} />
}
