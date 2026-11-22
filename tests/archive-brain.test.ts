import { describe, it, expect } from 'vitest'
import {
  upsertArchiveItem,
  searchArchiveItems,
  collectionContextBundle,
  itemToLlmContext,
  useInAiPrompt,
  canAccessCollection,
  canAccessItem,
  normalizeTags,
} from '@/lib/archive-brain-rules'
import type { ArchiveCollection, BrainArchiveItem } from '@/lib/supabase/types'
import {
  listBrainForOwner,
  saveAnything,
  exportCollectionPack,
  MUTABLE_COLLECTIONS,
} from '@/lib/mock-archive-brain'
import { MOCK_MEMBERS } from '@/lib/mock-data'

const owner = MOCK_MEMBERS[0]

function item(
  partial: Partial<BrainArchiveItem> & Pick<BrainArchiveItem, 'id' | 'title' | 'source_id'>
): BrainArchiveItem {
  return {
    owner_id: 'dev-user-id',
    source_type: 'post',
    summary: null,
    content_text: 'body text searchable',
    source_url: null,
    extracted_text: null,
    tags: [],
    note: null,
    collection_ids: [],
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
    ...partial,
  }
}

describe('세컨드 브레인 아카이브', () => {
  it('동일 소스는 upsert로 중복 없이 병합', () => {
    let items: BrainArchiveItem[] = []
    const a = upsertArchiveItem(items, {
      owner_id: 'u1',
      source_type: 'toolbox',
      source_id: 'tool-1',
      title: 'A',
      content_text: 'one',
      tags: ['mcp'],
      collection_ids: [],
    })
    items = a.items
    expect(a.created).toBe(true)
    const b = upsertArchiveItem(items, {
      owner_id: 'u1',
      source_type: 'toolbox',
      source_id: 'tool-1',
      title: 'A2',
      content_text: 'two',
      tags: ['github'],
      note: 'n',
      collection_ids: ['col-1'],
    })
    expect(b.created).toBe(false)
    expect(b.items).toHaveLength(1)
    expect(b.item.tags.sort()).toEqual(['github', 'mcp'])
    expect(b.item.collection_ids).toContain('col-1')
  })

  it('전문 검색이 본문·추출문·노트를 찾는다', () => {
    const items = [
      item({
        id: '1',
        title: 'Alpha',
        source_id: 'p1',
        content_text: 'hello',
        extracted_text: 'secret-transcript-xyz',
      }),
      item({
        id: '2',
        title: 'Beta',
        source_id: 'p2',
        content_text: 'other',
        note: 'personal-memo-zzz',
      }),
    ]
    expect(
      searchArchiveItems(items, { ownerId: 'dev-user-id', q: 'transcript-xyz' })
    ).toHaveLength(1)
    expect(
      searchArchiveItems(items, { ownerId: 'dev-user-id', q: 'memo-zzz' })
    ).toHaveLength(1)
  })

  it('컬렉션 컨텍스트 팩에 markdown/llms/skill이 포함된다', () => {
    const collection: ArchiveCollection = {
      id: 'c1',
      owner_id: 'dev-user-id',
      name: 'Stack',
      description: 'desc',
      is_shared: false,
      created_at: '2026-11-01T00:00:00Z',
      updated_at: '2026-11-01T00:00:00Z',
    }
    const items = [
      item({
        id: '1',
        title: 'Doc One',
        source_id: 'p1',
        collection_ids: ['c1'],
        content_text: 'important context',
      }),
    ]
    const pack = collectionContextBundle(collection, items)
    expect(pack.itemCount).toBe(1)
    expect(pack.markdown).toContain('Doc One')
    expect(pack.llmsTxt).toContain('# Stack')
    expect(pack.skillMd).toContain('name: aisubal-stack')
  })

  it('Use in AI 프롬프트에 aisubal:// 참조가 들어간다', () => {
    const i = item({ id: 'ba-9', title: 'T', source_id: 'x', content_text: 'c' })
    const prompt = useInAiPrompt(i)
    expect(prompt).toContain('aisubal://archive/ba-9')
    expect(itemToLlmContext(i)).toContain('# T')
  })

  it('비공개 컬렉션은 소유자만, 공유 컬렉션은 멤버 접근 가능', () => {
    const priv: ArchiveCollection = {
      id: 'priv',
      owner_id: 'owner',
      name: 'P',
      description: null,
      is_shared: false,
      created_at: '2026-11-01T00:00:00Z',
      updated_at: '2026-11-01T00:00:00Z',
    }
    const shared: ArchiveCollection = { ...priv, id: 'pub', is_shared: true }
    expect(canAccessCollection(priv, 'owner')).toBe(true)
    expect(canAccessCollection(priv, 'other')).toBe(false)
    expect(canAccessCollection(shared, 'other')).toBe(true)

    const i = item({
      id: '1',
      title: 'x',
      source_id: 's',
      owner_id: 'owner',
      collection_ids: ['pub'],
    })
    expect(canAccessItem(i, 'other', [shared])).toBe(true)
    expect(canAccessItem(i, 'other', [priv])).toBe(false)
  })

  it('시드 브레인에 여러 소스 타입이 있다', () => {
    const items = listBrainForOwner('dev-user-id')
    const types = new Set(items.map((i) => i.source_type))
    expect(types.has('toolbox')).toBe(true)
    expect(types.has('meetup')).toBe(true)
    expect(types.has('product')).toBe(true)
    expect(types.size).toBeGreaterThanOrEqual(4)
  })

  it('태그 정규화', () => {
    expect(normalizeTags('#mcp, github  문서')).toEqual(['mcp', 'github', '문서'])
  })

  it('컬렉션 export 팩', () => {
    const col = MUTABLE_COLLECTIONS[0]
    const pack = exportCollectionPack(col.id, 'dev-user-id')
    expect(pack).not.toBeNull()
    expect(pack!.files.length).toBeGreaterThan(0)
    expect(pack!.llmsTxt).toContain(col.name)
  })

  it('saveAnything로 저장', () => {
    const result = saveAnything(owner, {
      source_type: 'product',
      source_id: 'product-test-unique',
      title: 'Test Product Save',
      content_text: 'hello brain',
      tags: ['test'],
    })
    expect(result.created).toBe(true)
    const again = saveAnything(owner, {
      source_type: 'product',
      source_id: 'product-test-unique',
      title: 'Test Product Save',
      content_text: 'hello brain 2',
      tags: ['again'],
    })
    expect(again.created).toBe(false)
  })
})
