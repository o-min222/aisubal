import { redirect, notFound } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { Header } from '@/components/header'
import { getProductDetails } from '@/lib/data/products'
import { ProductDetailClient } from './product-detail-client'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ProductDetailPage({ params }: PageProps) {
  const { id } = await params
  const state = await getUserState()

  if (state.type === 'unauthenticated') {
    redirect('/login')
  }

  if (state.type === 'waitlist') {
    redirect('/waitlist')
  }

  const product = await getProductDetails(id, state.member.id)

  if (!product) {
    notFound()
  }

  return (
    <div className="min-h-screen bg-[#f7f7f7]">
      <Header member={state.member} />
      <main className="container-main page-main">
        <ProductDetailClient product={product} />
      </main>
    </div>
  )
}
