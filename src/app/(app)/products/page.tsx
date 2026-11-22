import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { listProductsRanked, featuredProducts } from '@/lib/data/products'
import { ProductsClient } from './products-client'

export default async function ProductsPage() {
  const state = await getUserState()

  if (state.type === 'unauthenticated') {
    redirect('/login')
  }

  if (state.type === 'waitlist') {
    redirect('/waitlist')
  }

  const [initialProducts, featured] = await Promise.all([
    listProductsRanked('all', state.member.id),
    featuredProducts(3, state.member.id),
  ])

  return (
    <>
        <Suspense fallback={<div className="text-sm text-[#888]">프로덕트를 불러오는 중...</div>}>
          <ProductsClient initialProducts={initialProducts} featured={featured} />
        </Suspense>
      </>
  )
}
