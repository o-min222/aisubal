import { redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { NewProductClient } from './new-product-client'

export default async function NewProductPage() {
  const state = await getUserState()

  if (state.type === 'unauthenticated') {
    redirect('/login')
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