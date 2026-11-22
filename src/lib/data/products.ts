import {
  featuredProducts as mockFeatured,
  getProductDetails as mockGetDetails,
  listProductsRanked as mockListRanked,
  MOCK_PRODUCTS,
  MUTABLE_UPVOTES,
} from '@/lib/mock-products'
import { MOCK_MEMBERS } from '@/lib/mock-data'
import { addUpvote, removeUpvote, rankProducts, countUpvotes, type RankingWindow } from '@/lib/product-rules'
import { toPublicAuthor } from '@/lib/profile'
import type { Member, Product, ProductComment, ProductUpdate, PublicAuthor } from '@/lib/supabase/types'
import { sb, useMockData } from './client'
import { MEMBER_PUBLIC_COLUMNS } from './member-columns'
import type { ProductWithDetails } from './types'

export type { ProductWithDetails } from './types'

type CreateProductInput = {
  name: string
  tagline: string
  description: string
  logo_url?: string | null
  screenshots?: string[]
  website_url?: string | null
  app_store_url?: string | null
  github_url?: string | null
  tags?: string[]
  maker_ids?: string[]
}

async function makerAuthors(makerIds: string[]): Promise<PublicAuthor[]> {
  if (useMockData()) {
    return makerIds
      .map((id) => MOCK_MEMBERS.find((m) => m.id === id))
      .filter((m): m is Member => Boolean(m))
      .map((m) => toPublicAuthor(m, 'real'))
  }
  if (!makerIds.length) return []
  const supabase = await sb()
  const { data, error } = await supabase
    .from('members')
    .select(MEMBER_PUBLIC_COLUMNS)
    .in('id', makerIds)
  if (error) throw error
  return (data || []).map((m) =>
    toPublicAuthor({ email: '', ...(m as object) } as Member, 'real')
  )
}

async function hydrateProduct(
  product: Product,
  viewerId?: string
): Promise<ProductWithDetails> {
  if (useMockData()) {
    return mockGetDetails(product.id, viewerId)!
  }

  const supabase = await sb()
  const [{ data: upvotes }, { data: comments }, { data: updates }] = await Promise.all([
    supabase.from('product_upvotes').select('*').eq('product_id', product.id),
    supabase.from('product_comments').select('*').eq('product_id', product.id).order('created_at'),
    supabase.from('product_updates').select('*').eq('product_id', product.id).order('created_at', { ascending: false }),
  ])

  const commentRows = (comments || []) as ProductComment[]
  const commentMemberIds = commentRows.map((c) => c.member_id)
  const members = new Map<string, Member>()
  const allIds = [...new Set([...product.maker_ids, ...commentMemberIds])]
  if (allIds.length) {
    const { data: memberRows } = await supabase
      .from('members')
      .select(MEMBER_PUBLIC_COLUMNS)
      .in('id', allIds)
    for (const m of memberRows || []) {
      members.set((m as Member).id, { email: '', ...(m as object) } as Member)
    }
  }

  const makers = product.maker_ids
    .map((id) => members.get(id))
    .filter((m): m is Member => Boolean(m))
    .map((m) => toPublicAuthor(m, 'real'))

  return {
    ...product,
    makers: makers.length ? makers : await makerAuthors(product.maker_ids),
    upvote_count: (upvotes || []).length,
    comments: commentRows.map((c) => {
      const m = members.get(c.member_id)
      return {
        ...c,
        author: m
          ? toPublicAuthor(m, c.posted_as)
          : {
              kind: 'real' as const,
              id: c.member_id,
              display_name: '멤버',
              bio: null,
              avatar_url: null,
            },
      }
    }),
    updates: (updates || []) as ProductUpdate[],
    user_upvoted: viewerId
      ? (upvotes || []).some(
          (u: { member_id: string }) => u.member_id === viewerId
        )
      : false,
  }
}

export async function getProductDetails(
  productId: string,
  viewerId?: string
): Promise<ProductWithDetails | null> {
  if (useMockData()) return mockGetDetails(productId, viewerId)

  const supabase = await sb()
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', productId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return hydrateProduct(data as Product, viewerId)
}

export async function listProductsRanked(
  window: RankingWindow = 'all',
  viewerId?: string,
  now = new Date()
): Promise<ProductWithDetails[]> {
  if (useMockData()) return mockListRanked(window, viewerId, now)

  const supabase = await sb()
  const { data: products, error } = await supabase.from('products').select('*')
  if (error) throw error
  const { data: upvotes, error: uErr } = await supabase.from('product_upvotes').select('*')
  if (uErr) throw uErr

  const ranked = rankProducts(
    (products || []).map((p: Product) => p.id),
    (upvotes || []) as Parameters<typeof rankProducts>[1],
    window,
    now
  )

  const result: ProductWithDetails[] = []
  for (const r of ranked) {
    const product = (products || []).find((p: Product) => p.id === r.productId)
    if (!product) continue
    result.push(await hydrateProduct(product as Product, viewerId))
  }
  return result
}

export async function featuredProducts(
  limit = 3,
  viewerId?: string
): Promise<ProductWithDetails[]> {
  if (useMockData()) return mockFeatured(limit, viewerId)

  const supabase = await sb()
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('featured', true)
    .order('launched_at', { ascending: false })
    .limit(limit)
  if (error) throw error

  const result: ProductWithDetails[] = []
  for (const p of (data || []) as Product[]) {
    result.push(await hydrateProduct(p, viewerId))
  }
  return result
}

export async function createProduct(
  member: Member,
  data: CreateProductInput
): Promise<ProductWithDetails> {
  if (useMockData()) {
    const product: Product = {
      id: `product-${Date.now()}`,
      name: data.name,
      tagline: data.tagline,
      description: data.description,
      logo_url: data.logo_url ?? null,
      screenshots: data.screenshots ?? [],
      website_url: data.website_url ?? null,
      app_store_url: data.app_store_url ?? null,
      github_url: data.github_url ?? null,
      tags: data.tags ?? [],
      maker_ids: data.maker_ids?.length ? data.maker_ids : [member.id],
      launch_post_id: null,
      featured: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      launched_at: new Date().toISOString(),
    }
    MOCK_PRODUCTS.unshift(product)
    return mockGetDetails(product.id, member.id)!
  }

  const supabase = await sb()
  const { data: inserted, error } = await supabase
    .from('products')
    .insert({
      name: data.name,
      tagline: data.tagline,
      description: data.description,
      logo_url: data.logo_url ?? null,
      screenshots: data.screenshots ?? [],
      website_url: data.website_url ?? null,
      app_store_url: data.app_store_url ?? null,
      github_url: data.github_url ?? null,
      tags: data.tags ?? [],
      maker_ids: data.maker_ids?.length ? data.maker_ids : [member.id],
      featured: false,
    })
    .select('*')
    .single()
  if (error) throw error
  return hydrateProduct(inserted as Product, member.id)
}

export async function toggleProductUpvote(
  productId: string,
  memberId: string,
  action: 'add' | 'remove'
): Promise<ProductWithDetails | null> {
  if (useMockData()) {
    if (action === 'add') {
      const result = addUpvote(MUTABLE_UPVOTES, productId, memberId)
      if (!result.ok) throw new Error(result.reason)
      MUTABLE_UPVOTES.splice(0, MUTABLE_UPVOTES.length, ...result.upvotes)
    } else {
      const next = removeUpvote(MUTABLE_UPVOTES, productId, memberId)
      MUTABLE_UPVOTES.splice(0, MUTABLE_UPVOTES.length, ...next)
    }
    return mockGetDetails(productId, memberId)
  }

  const supabase = await sb()
  if (action === 'add') {
    const { error } = await supabase.from('product_upvotes').insert({
      product_id: productId,
      member_id: memberId,
    })
    if (error) {
      if (error.code === '23505') throw new Error('이미 업보트했습니다.')
      throw error
    }
  } else {
    const { error } = await supabase
      .from('product_upvotes')
      .delete()
      .eq('product_id', productId)
      .eq('member_id', memberId)
    if (error) throw error
  }
  return getProductDetails(productId, memberId)
}

/** Expose upvote count helper for tests / MCP */
export function mockUpvoteCount(productId: string) {
  return countUpvotes(MUTABLE_UPVOTES, productId)
}
