import type {
  ArchiveCollection,
  ArchiveHighlight,
  ArchiveSourceType,
  BrainArchiveItem,
} from '@/lib/supabase/types'

export const ARCHIVE_SOURCE_LABEL: Record<ArchiveSourceType, string> = {
  post: '게시물',
  link: '링크',
  asset: '에셋',
  toolbox: '툴박스',
  meetup: '모임',
  product: '프로덕트',
}

export function normalizeTags(raw: string | string[] | null | undefined): string[] {
  if (!raw) return []
  const list = Array.isArray(raw) ? raw : raw.split(/[,#\s]+/)
  return Array.from(
    new Set(
      list
        .map((t) => t.trim())
        .filter(Boolean)
        .map((t) => t.replace(/^#/, ''))
    )
  )
}

export function dedupeKey(ownerId: string, sourceType: ArchiveSourceType, sourceId: string) {
  return `${ownerId}:${sourceType}:${sourceId}`
}

export function findExisting(
  items: BrainArchiveItem[],
  ownerId: string,
  sourceType: ArchiveSourceType,
  sourceId: string
): BrainArchiveItem | undefined {
  return items.find(
    (i) =>
      i.owner_id === ownerId && i.source_type === sourceType && i.source_id === sourceId
  )
}

export function upsertArchiveItem(
  items: BrainArchiveItem[],
  incoming: {
    id?: string
    owner_id: string
    source_type: ArchiveSourceType
    source_id: string
    title: string
    summary?: string | null
    content_text: string
    source_url?: string | null
    extracted_text?: string | null
    tags?: string[]
    note?: string | null
    collection_ids?: string[]
    created_at?: string
    updated_at?: string
  }
): { items: BrainArchiveItem[]; item: BrainArchiveItem; created: boolean } {
  const existing = findExisting(
    items,
    incoming.owner_id,
    incoming.source_type,
    incoming.source_id
  )
  const now = new Date().toISOString()
  if (existing) {
    const merged: BrainArchiveItem = {
      ...existing,
      title: incoming.title || existing.title,
      summary: incoming.summary ?? existing.summary,
      content_text: incoming.content_text || existing.content_text,
      source_url: incoming.source_url ?? existing.source_url,
      extracted_text: incoming.extracted_text ?? existing.extracted_text,
      tags: Array.from(new Set([...existing.tags, ...normalizeTags(incoming.tags || [])])),
      note: incoming.note ?? existing.note,
      collection_ids: Array.from(
        new Set([...existing.collection_ids, ...(incoming.collection_ids || [])])
      ),
      updated_at: now,
    }
    return {
      created: false,
      item: merged,
      items: items.map((i) => (i.id === existing.id ? merged : i)),
    }
  }
  const item: BrainArchiveItem = {
    id: incoming.id || `ba-${Date.now()}`,
    owner_id: incoming.owner_id,
    source_type: incoming.source_type,
    source_id: incoming.source_id,
    title: incoming.title,
    summary: incoming.summary ?? null,
    content_text: incoming.content_text,
    source_url: incoming.source_url ?? null,
    extracted_text: incoming.extracted_text ?? null,
    tags: normalizeTags(incoming.tags || []),
    note: incoming.note ?? null,
    collection_ids: [...(incoming.collection_ids || [])],
    created_at: incoming.created_at || now,
    updated_at: now,
  }
  return { created: true, item, items: [item, ...items] }
}

export function searchArchiveItems(
  items: BrainArchiveItem[],
  opts: {
    ownerId: string
    q?: string
    type?: ArchiveSourceType | 'all'
    tag?: string
    collectionId?: string
  }
): BrainArchiveItem[] {
  let list = items.filter((i) => i.owner_id === opts.ownerId)
  if (opts.type && opts.type !== 'all') {
    list = list.filter((i) => i.source_type === opts.type)
  }
  if (opts.tag) {
    list = list.filter((i) => i.tags.includes(opts.tag!))
  }
  if (opts.collectionId) {
    list = list.filter((i) => i.collection_ids.includes(opts.collectionId!))
  }
  if (opts.q?.trim()) {
    const q = opts.q.trim().toLowerCase()
    list = list.filter((i) => {
      const blob = [
        i.title,
        i.summary || '',
        i.content_text,
        i.extracted_text || '',
        i.note || '',
        i.tags.join(' '),
      ]
        .join('\n')
        .toLowerCase()
      return blob.includes(q)
    })
  }
  return list.sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  )
}

/** Compact LLM-ready context for one item */
export function itemToLlmContext(item: BrainArchiveItem): string {
  const parts = [
    `# ${item.title}`,
    `Type: ${ARCHIVE_SOURCE_LABEL[item.source_type]} (${item.source_type})`,
    item.source_url ? `Source: ${item.source_url}` : null,
    item.tags.length ? `Tags: ${item.tags.map((t) => `#${t}`).join(' ')}` : null,
    item.note ? `Personal note: ${item.note}` : null,
    '',
    item.summary ? `## Summary\n${item.summary}` : null,
    '',
    '## Content',
    item.content_text,
    item.extracted_text
      ? `\n## Extracted text / transcript\n${item.extracted_text}`
      : null,
  ].filter((x) => x !== null && x !== undefined)
  return parts.join('\n')
}

export function collectionContextBundle(
  collection: ArchiveCollection,
  items: BrainArchiveItem[],
  highlights: ArchiveHighlight[] = []
): {
  markdown: string
  llmsTxt: string
  skillMd: string
  itemCount: number
} {
  const owned = items.filter((i) => i.collection_ids.includes(collection.id))
  const sections = owned.map((item, idx) => {
    const hs = highlights.filter((h) => h.item_id === item.id)
    const hl =
      hs.length > 0
        ? '\n### Highlights\n' +
          hs.map((h) => `- “${h.quote}”${h.note ? ` — ${h.note}` : ''}`).join('\n')
        : ''
    return `## ${idx + 1}. ${item.title}\n${itemToLlmContext(item)}${hl}`
  })

  const markdown = [
    `# Collection: ${collection.name}`,
    collection.description || '',
    `Items: ${owned.length}`,
    `Privacy: ${collection.is_shared ? 'shared with members' : 'private'}`,
    '',
    ...sections,
  ].join('\n')

  const llmsTxt = [
    `# ${collection.name}`,
    `> ${collection.description || 'AI쓰발 archive collection context pack'}`,
    '',
    '## Docs',
    ...owned.map(
      (i) =>
        `- [${i.title}](./items/${slugify(i.title)}.md): ${i.summary || i.source_type}`
    ),
  ].join('\n')

  const skillMd = [
    '---',
    `name: aisubal-${slugify(collection.name)}`,
    `description: Knowledge skill exported from AI쓰발 collection "${collection.name}"`,
    '---',
    '',
    `# ${collection.name}`,
    '',
    collection.description || '',
    '',
    'Use this knowledge when the user asks about saved community content from this collection.',
    '',
    markdown,
  ].join('\n')

  return { markdown, llmsTxt, skillMd, itemCount: owned.length }
}

export function useInAiPrompt(item: BrainArchiveItem): string {
  return [
    'You are helping me with material from my AI쓰발 second-brain archive.',
    `Reference: aisubal://archive/${item.id}`,
    '',
    '--- BEGIN ARCHIVE CONTEXT ---',
    itemToLlmContext(item),
    '--- END ARCHIVE CONTEXT ---',
    '',
    'Please use the context above to answer my next question.',
  ].join('\n')
}

export function useInAiCollectionPrompt(
  collection: ArchiveCollection,
  items: BrainArchiveItem[]
): string {
  const bundle = collectionContextBundle(collection, items)
  return [
    'You are helping me with a collection from my AI쓰발 second-brain archive.',
    `Reference: aisubal://collection/${collection.id}`,
    '',
    '--- BEGIN COLLECTION CONTEXT ---',
    bundle.markdown.slice(0, 12000),
    bundle.markdown.length > 12000 ? '\n…(truncated)…' : '',
    '--- END COLLECTION CONTEXT ---',
    '',
    'Please use this collection as background knowledge.',
  ].join('\n')
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/gi, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'item'
}

export function canAccessItem(
  item: BrainArchiveItem,
  viewerId: string,
  collections: ArchiveCollection[]
): boolean {
  if (item.owner_id === viewerId) return true
  // shared only via shared collections
  return item.collection_ids.some((cid) => {
    const c = collections.find((x) => x.id === cid)
    return Boolean(c && c.is_shared)
  })
}

export function canAccessCollection(
  collection: ArchiveCollection,
  viewerId: string
): boolean {
  return collection.owner_id === viewerId || collection.is_shared
}
