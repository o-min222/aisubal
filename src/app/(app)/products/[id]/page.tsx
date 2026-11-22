import { redirect, notFound } from 'next/navigation'
import { getUserState } from '@/lib/auth'
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
    <>
        <ProductDetailClient product={product} />
      </>
  )
}
