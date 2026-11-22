import { redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { Header } from '@/components/header'
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
    <div className="min-h-screen bg-[#f7f7f7]">
      <Header member={state.member} />
      <main className="container-main page-main">
        <NewProductClient />
      </main>
    </div>
  )
}