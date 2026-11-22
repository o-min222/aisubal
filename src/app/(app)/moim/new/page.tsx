import { redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { moimHostOptions } from '@/lib/data/moim'
import { MoimForm } from '@/components/moim/moim-form'
import { getT } from '@/i18n/server'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('모임 열기 · AI쓰발') }
}

/** 모임 are always created here (never inside a group page); the host can be me or a group I run. */
export default async function NewMoimPage({ searchParams }: { searchParams: Promise<{ group?: string }> }) {
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')
  const groups = await moimHostOptions(state.member.id).catch(() => [])
  const want = (await searchParams).group
  const initialGroup = groups.find((g) => g.id === want || g.slug === want)?.id ?? null
  return <MoimForm me={{ name: state.member.display_name }} hostGroups={groups} initialGroupId={initialGroup} />
}
