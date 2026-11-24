import { redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { NewProductClient } from './new-product-client'
import { getT } from '@/i18n/server'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('갤러리 등록 · AI쓰발') }
}

export default async function NewProductPage() {
  const state = await getUserState()

  if (state.type === 'unauthenticated') {
    redirect('/')
  }

  if (state.type === 'waitlist') {
    redirect('/waitlist')
  }

  return (
    <>
        <NewProductClient />
      </>
  )
}