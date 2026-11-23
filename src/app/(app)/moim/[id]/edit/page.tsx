import { notFound, redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { getMoim, listMoimInvitees } from '@/lib/data/moim'
import { MoimForm } from '@/components/moim/moim-form'
import { getT } from '@/i18n/server'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('모임 수정 · AI쓰발') }
}

export default async function EditMoimPage({ params }: { params: Promise<{ id: string }> }) {
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')
  const { id } = await params
  const m = await getMoim(state.member.id, id).catch(() => null)
  if (!m) notFound()
  if (!m.canManage) redirect(`/moim/${id}`)
  const invitees = await listMoimInvitees(state.member.id, id).catch(() => null)
  return <MoimForm me={{ name: state.member.display_name }} hostGroups={[]} edit={m} invitees={invitees} />
}
