import {
  buildUseInAi as mockBuildUseInAi,
  exportCollectionPack as mockExportPack,
  getBrainItem as mockGetBrainItem,
  getCollection as mockGetCollection,
  isSaved as mockIsSaved,
  listBrainForOwner as mockListBrain,
  MUTABLE_BRAIN,
  MUTABLE_COLLECTIONS,
  MUTABLE_HIGHLIGHTS,
  saveAnything as mockSaveAnything,
} from '@/lib/mock-archive-brain'
import {
  normalizeTags,
  searchArchiveItems,
  useInAiCollectionPrompt,
} from '@/lib/archive-brain-rules'
import type {
  ArchiveCollection,
  ArchiveHighlight,
  ArchiveSourceType,
  BrainArchiveItem,
  Member,
} from '@/lib/supabase/types'
import { sb, useMockData } from './client'
import { msg } from '@/i18n/translate'

type SaveInput = {
  source_type: ArchiveSourceType
  source_id: string
  title: string
  summary?: string | null
  content_text: string
  source_url?: string | null
  extracted_text?: string | null
  tags?: string[] | string
  note?: string | null
  collection_ids?: string[]
}

async function collectionIdsForItem(itemId: string): Promise<string[]> {
  const supabase = await sb()
  const { data, error } = await supabase
    .from('brain_archive_collection_items')
    .select('collection_id')
    .eq('item_id', itemId)
  if (error) throw error
  return (data || []).map((r: { collection_id: string }) => r.collection_id)
}

async function hydrateBrainItem(
  row: Omit<BrainArchiveItem, 'collection_ids'> & { collection_ids?: string[] }
): Promise<BrainArchiveItem> {
  const collection_ids =
    row.collection_ids ?? (await collectionIdsForItem(row.id))
  return { ...row, collection_ids }
}

export async function listBrainForOwner(
  ownerId: string,
  opts?: {
    q?: string
    type?: ArchiveSourceType | 'all'
    tag?: string
    collectionId?: string
  }
): Promise<BrainArchiveItem[]> {
  if (useMockData()) return mockListBrain(ownerId, opts)

  const supabase = await sb()
  const { data, error } = await supabase
    .from('brain_archive_items')
    .select('*')
    .eq('owner_id', ownerId)
    .order('updated_at', { ascending: false })
  if (error) throw error

  const items: BrainArchiveItem[] = await Promise.all(
    (data || []).map((row) => hydrateBrainItem(row as BrainArchiveItem))
  )

  return searchArchiveItems(items, { ownerId, ...opts })
}

export async function getBrainItem(
  id: string,
  viewerId: string
): Promise<BrainArchiveItem | null> {
  if (useMockData()) return mockGetBrainItem(id, viewerId)

  const supabase = await sb()
  const { data, error } = await supabase
    .from('brain_archive_items')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  const item = await hydrateBrainItem(data as BrainArchiveItem)
  if (item.owner_id === viewerId) return item

  if (!item.collection_ids.length) return null
  const { data: cols } = await supabase
    .from('archive_collections')
    .select('id, is_shared')
    .in('id', item.collection_ids)
  const shared = (cols || []).some((c: { is_shared: boolean }) => c.is_shared)
  return shared ? item : null
}

export async function getCollection(
  id: string,
  viewerId: string
): Promise<ArchiveCollection | null> {
  if (useMockData()) return mockGetCollection(id, viewerId)

  const supabase = await sb()
  const { data, error } = await supabase
    .from('archive_collections')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const c = data as ArchiveCollection
  if (c.owner_id === viewerId || c.is_shared) return c
  return null
}

export async function listCollections(viewerId: string): Promise<
  Array<ArchiveCollection & { item_count?: number }>
> {
  if (useMockData()) {
    return MUTABLE_COLLECTIONS.filter(
      (c) => c.owner_id === viewerId || c.is_shared
    ).map((c) => ({
      ...c,
      item_count: MUTABLE_BRAIN.filter((i) => i.collection_ids.includes(c.id)).length,
    }))
  }

  const supabase = await sb()
  const { data, error } = await supabase
    .from('archive_collections')
    .select('*')
    .or(`owner_id.eq.${viewerId},is_shared.eq.true`)
    .order('created_at', { ascending: false })
  if (error) throw error

  const collections = (data || []) as ArchiveCollection[]
  return Promise.all(
    collections.map(async (c) => {
      const { count } = await supabase
        .from('brain_archive_collection_items')
        .select('item_id', { count: 'exact', head: true })
        .eq('collection_id', c.id)
      return { ...c, item_count: count ?? 0 }
    })
  )
}

export async function listHighlightsForItems(
  itemIds: string[]
): Promise<ArchiveHighlight[]> {
  if (!itemIds.length) return []
  if (useMockData()) {
    return MUTABLE_HIGHLIGHTS.filter((h) => itemIds.includes(h.item_id))
  }
  const supabase = await sb()
  const { data, error } = await supabase
    .from('archive_highlights')
    .select('*')
    .in('item_id', itemIds)
  if (error) throw error
  return (data || []) as ArchiveHighlight[]
}

export async function listHighlightsForItem(
  itemId: string
): Promise<ArchiveHighlight[]> {
  return listHighlightsForItems([itemId])
}

export async function saveAnything(owner: Member, input: SaveInput) {
  if (useMockData()) return mockSaveAnything(owner, input)

  const supabase = await sb()
  const tags = normalizeTags(input.tags)
  const payload = {
    owner_id: owner.id,
    source_type: input.source_type,
    source_id: input.source_id,
    title: input.title,
    summary: input.summary ?? null,
    content_text: input.content_text,
    source_url: input.source_url ?? null,
    extracted_text: input.extracted_text ?? null,
    tags,
    note: input.note ?? null,
    updated_at: new Date().toISOString(),
  }

  const { data: existing } = await supabase
    .from('brain_archive_items')
    .select('*')
    .eq('owner_id', owner.id)
    .eq('source_type', input.source_type)
    .eq('source_id', input.source_id)
    .maybeSingle()

  let item: BrainArchiveItem
  let created = false

  if (existing) {
    const { data, error } = await supabase
      .from('brain_archive_items')
      .update(payload)
      .eq('id', (existing as BrainArchiveItem).id)
      .select('*')
      .single()
    if (error) throw error
    item = await hydrateBrainItem(data as BrainArchiveItem)
  } else {
    const { data, error } = await supabase
      .from('brain_archive_items')
      .insert(payload)
      .select('*')
      .single()
    if (error) throw error
    item = await hydrateBrainItem(data as BrainArchiveItem)
    created = true
  }

  if (input.collection_ids?.length) {
    await supabase
      .from('brain_archive_collection_items')
      .delete()
      .eq('item_id', item.id)
    await supabase.from('brain_archive_collection_items').insert(
      input.collection_ids.map((collection_id) => ({
        collection_id,
        item_id: item.id,
      }))
    )
    item.collection_ids = input.collection_ids
  }

  return { item, created, items: [item] }
}

export async function isSaved(
  ownerId: string,
  sourceType: ArchiveSourceType,
  sourceId: string
): Promise<boolean> {
  if (useMockData()) return mockIsSaved(ownerId, sourceType, sourceId)

  const supabase = await sb()
  const { data, error } = await supabase
    .from('brain_archive_items')
    .select('id')
    .eq('owner_id', ownerId)
    .eq('source_type', sourceType)
    .eq('source_id', sourceId)
    .maybeSingle()
  if (error) throw error
  return Boolean(data)
}

export async function updateBrainItem(
  id: string,
  ownerId: string,
  patch: {
    note?: string | null
    tags?: string[] | string
    collection_ids?: string[]
  }
): Promise<BrainArchiveItem> {
  if (useMockData()) {
    const idx = MUTABLE_BRAIN.findIndex((i) => i.id === id && i.owner_id === ownerId)
    if (idx < 0) throw new Error(msg('항목을 찾을 수 없습니다.'))
    const cur = MUTABLE_BRAIN[idx]
    MUTABLE_BRAIN[idx] = {
      ...cur,
      note: patch.note !== undefined ? patch.note : cur.note,
      tags: patch.tags !== undefined ? normalizeTags(patch.tags) : cur.tags,
      collection_ids:
        patch.collection_ids !== undefined ? patch.collection_ids : cur.collection_ids,
      updated_at: new Date().toISOString(),
    }
    return MUTABLE_BRAIN[idx]
  }

  const supabase = await sb()
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.note !== undefined) update.note = patch.note
  if (patch.tags !== undefined) update.tags = normalizeTags(patch.tags)

  const { data, error } = await supabase
    .from('brain_archive_items')
    .update(update)
    .eq('id', id)
    .eq('owner_id', ownerId)
    .select('*')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error(msg('항목을 찾을 수 없습니다.'))

  if (patch.collection_ids !== undefined) {
    await supabase.from('brain_archive_collection_items').delete().eq('item_id', id)
    if (patch.collection_ids.length) {
      await supabase.from('brain_archive_collection_items').insert(
        patch.collection_ids.map((collection_id) => ({
          collection_id,
          item_id: id,
        }))
      )
    }
  }

  return hydrateBrainItem(data as BrainArchiveItem)
}

export async function deleteBrainItem(id: string, ownerId: string): Promise<boolean> {
  if (useMockData()) {
    const before = MUTABLE_BRAIN.length
    const next = MUTABLE_BRAIN.filter((i) => !(i.id === id && i.owner_id === ownerId))
    MUTABLE_BRAIN.splice(0, MUTABLE_BRAIN.length, ...next)
    return next.length < before
  }

  const supabase = await sb()
  const { error, count } = await supabase
    .from('brain_archive_items')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('owner_id', ownerId)
  if (error) throw error
  return (count ?? 0) > 0
}

export async function createCollection(
  owner: Member,
  input: { name: string; description?: string; is_shared?: boolean }
): Promise<ArchiveCollection> {
  if (useMockData()) {
    const collection: ArchiveCollection = {
      id: `col-${Date.now()}`,
      owner_id: owner.id,
      name: input.name,
      description: input.description || null,
      is_shared: input.is_shared ?? false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    MUTABLE_COLLECTIONS.unshift(collection)
    return collection
  }

  const supabase = await sb()
  const { data, error } = await supabase
    .from('archive_collections')
    .insert({
      owner_id: owner.id,
      name: input.name,
      description: input.description || null,
      is_shared: input.is_shared ?? false,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as ArchiveCollection
}

export async function addHighlight(
  itemId: string,
  owner: Member,
  quote: string,
  note?: string | null
): Promise<ArchiveHighlight> {
  if (useMockData()) {
    const item = mockGetBrainItem(itemId, owner.id)
    if (!item || item.owner_id !== owner.id) {
      throw new Error(msg('항목을 찾을 수 없습니다.'))
    }
    const hl: ArchiveHighlight = {
      id: `hl-${Date.now()}`,
      item_id: itemId,
      owner_id: owner.id,
      quote,
      note: note ?? null,
      created_at: new Date().toISOString(),
    }
    MUTABLE_HIGHLIGHTS.unshift(hl)
    return hl
  }

  const item = await getBrainItem(itemId, owner.id)
  if (!item || item.owner_id !== owner.id) {
    throw new Error(msg('항목을 찾을 수 없습니다.'))
  }
  const supabase = await sb()
  const { data, error } = await supabase
    .from('archive_highlights')
    .insert({
      item_id: itemId,
      owner_id: owner.id,
      quote,
      note: note ?? null,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as ArchiveHighlight
}

export async function exportCollectionPack(collectionId: string, viewerId: string) {
  if (useMockData()) return mockExportPack(collectionId, viewerId)

  const collection = await getCollection(collectionId, viewerId)
  if (!collection) return null

  const supabase = await sb()
  const { data: links } = await supabase
    .from('brain_archive_collection_items')
    .select('item_id')
    .eq('collection_id', collectionId)
  const itemIds = (links || []).map((l: { item_id: string }) => l.item_id)
  if (!itemIds.length) {
    return {
      collection,
      llmsTxt: '',
      skillMd: '',
      markdown: `# ${collection.name}\n`,
      files: [] as Array<{ filename: string; content: string }>,
    }
  }

  const { data: items } = await supabase
    .from('brain_archive_items')
    .select('*')
    .in('id', itemIds)
  const hydrated: BrainArchiveItem[] = await Promise.all(
    (items || []).map((row) => hydrateBrainItem(row as BrainArchiveItem))
  )
  const highlights = await listHighlightsForItems(itemIds)

  const { collectionContextBundle, itemToLlmContext } = await import(
    '@/lib/archive-brain-rules'
  )
  return {
    collection,
    ...collectionContextBundle(collection, hydrated, highlights),
    files: hydrated.map((i) => ({
      filename: `${i.id}.md`,
      content: itemToLlmContext(i),
    })),
  }
}

export async function buildUseInAi(itemId: string, viewerId: string) {
  if (useMockData()) return mockBuildUseInAi(itemId, viewerId)

  const item = await getBrainItem(itemId, viewerId)
  if (!item) return null
  const { useInAiPrompt, itemToLlmContext } = await import('@/lib/archive-brain-rules')
  return {
    prompt: useInAiPrompt(item),
    reference: `aisubal://archive/${item.id}`,
    markdown: itemToLlmContext(item),
  }
}

export async function getCollectionDetail(id: string, viewerId: string) {
  const collection = await getCollection(id, viewerId)
  if (!collection) return null

  if (useMockData()) {
    const items = MUTABLE_BRAIN.filter((i) => i.collection_ids.includes(id))
    const pack = mockExportPack(id, viewerId)
    return {
      collection,
      items,
      use_in_ai: {
        prompt: useInAiCollectionPrompt(collection, items),
        reference: `aisubal://collection/${collection.id}`,
      },
      context_preview: pack?.markdown.slice(0, 2000),
    }
  }

  const supabase = await sb()
  const { data: links } = await supabase
    .from('brain_archive_collection_items')
    .select('item_id')
    .eq('collection_id', id)
  const itemIds = (links || []).map((l: { item_id: string }) => l.item_id)
  const items: BrainArchiveItem[] = []
  if (itemIds.length) {
    const { data } = await supabase.from('brain_archive_items').select('*').in('id', itemIds)
    items.push(
      ...(await Promise.all(
        (data || []).map((row) => hydrateBrainItem(row as BrainArchiveItem))
      ))
    )
  }
  const pack = await exportCollectionPack(id, viewerId)
  return {
    collection,
    items,
    use_in_ai: {
      prompt: useInAiCollectionPrompt(collection, items),
      reference: `aisubal://collection/${collection.id}`,
    },
    context_preview: pack?.markdown.slice(0, 2000),
  }
}

/** Resolve content for saving from another domain entity. */
export async function resolveArchiveSource(
  type: ArchiveSourceType,
  id: string
): Promise<{
  title: string
  summary: string | null
  content_text: string
  source_url: string | null
  extracted_text: string | null
} | null> {
  if (type === 'post' || type === 'link') {
    const { getPost } = await import('@/lib/data/posts')
    const post = await getPost(id)
    if (!post) return null
    const extracted =
      post.link_type === 'youtube'
        ? `[YouTube transcript placeholder]\n${post.link_title}\n${post.url}`
        : post.url
          ? `[Fetched page excerpt]\n${post.link_description || ''}`
          : null
    return {
      title: post.title,
      summary: post.link_description || post.content.slice(0, 140),
      content_text: `${post.content}\n${post.assets.map((a) => a.content).join('\n')}`,
      source_url: post.url,
      extracted_text: extracted,
    }
  }
  if (type === 'asset') {
    const { listPosts } = await import('@/lib/data/posts')
    const posts = await listPosts()
    for (const post of posts) {
      const asset = post.assets.find((a) => a.id === id)
      if (asset) {
        return {
          title: `${asset.name} (${asset.type})`,
          summary: `From ${post.title}`,
          content_text: asset.content,
          source_url: null,
          extracted_text: null,
        }
      }
    }
    return null
  }
  if (type === 'toolbox') {
    const { getToolboxEntry } = await import('@/lib/data/toolbox')
    const t = await getToolboxEntry(id)
    if (!t) return null
    return {
      title: t.name,
      summary: t.one_liner,
      content_text: t.description,
      source_url: t.canonical_url,
      extracted_text: null,
    }
  }
  if (type === 'meetup') {
    const [{ getMoim }, { getMember }] = await Promise.all([import('@/lib/data/moim'), import('@/lib/auth')])
    const viewer = await getMember()
    const m = viewer ? await getMoim(viewer.id, id) : null
    if (!m) return null
    return {
      title: m.title,
      summary: m.mode,
      content_text: m.description,
      source_url: null,
      extracted_text: null,
    }
  }
  if (type === 'product') {
    const { getProductDetails } = await import('@/lib/data/products')
    const p = await getProductDetails(id)
    if (!p) return null
    return {
      title: p.name,
      summary: p.tagline,
      content_text: p.description,
      source_url: p.website_url || p.github_url,
      extracted_text: null,
    }
  }
  return null
}
