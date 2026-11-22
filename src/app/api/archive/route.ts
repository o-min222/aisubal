import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getMember } from '@/lib/auth'
import {
  listBrainForOwner,
  listCollections,
  listHighlightsForItems,
  resolveArchiveSource,
  saveAnything,
} from '@/lib/data/archive'
import type { ArchiveSourceType } from '@/lib/supabase/types'
import { ARCHIVE_SOURCE_LABEL } from '@/lib/archive-brain-rules'
import { te } from '@/i18n/server'

const saveSchema = z.object({
  source_type: z.enum(['post', 'link', 'asset', 'toolbox', 'meetup', 'product']),
  source_id: z.string().min(1),
  title: z.string().optional(),
  note: z.string().nullable().optional(),
  tags: z.union([z.string(), z.array(z.string())]).optional(),
  collection_ids: z.array(z.string()).optional(),
  // legacy
  postId: z.string().optional(),
})

export async function GET(request: NextRequest) {
  const member = await getMember()
  if (!member) {
    return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  }

  const sp = request.nextUrl.searchParams
  const items = await listBrainForOwner(member.id, {
    q: sp.get('q') || undefined,
    type: (sp.get('type') as ArchiveSourceType | 'all') || 'all',
    tag: sp.get('tag') || undefined,
    collectionId: sp.get('collection') || undefined,
  })
  const highlights = await listHighlightsForItems(items.map((i) => i.id))
  const collections = await listCollections(member.id)

  return NextResponse.json({
    items: items.map((i) => ({
      ...i,
      type_label: ARCHIVE_SOURCE_LABEL[i.source_type],
      highlights: highlights.filter((h) => h.item_id === i.id),
    })),
    collections,
  })
}

export async function POST(request: NextRequest) {
  const member = await getMember()
  if (!member) {
    return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  }

  try {
    const body = await request.json()
    if (body.postId && !body.source_id) {
      body.source_type = 'post'
      body.source_id = body.postId
    }
    const data = saveSchema.parse(body)

    const resolved = await resolveArchiveSource(data.source_type, data.source_id)
    if (!resolved) {
      return NextResponse.json({ error: await te('저장할 대상을 찾을 수 없습니다.') }, { status: 404 })
    }

    const result = await saveAnything(member, {
      source_type: data.source_type === 'post' && resolved.source_url ? 'link' : data.source_type,
      source_id: data.source_id,
      title: data.title || resolved.title,
      summary: resolved.summary,
      content_text: resolved.content_text,
      source_url: resolved.source_url,
      extracted_text: resolved.extracted_text,
      tags: data.tags,
      note: data.note,
      collection_ids: data.collection_ids,
    })

    return NextResponse.json(
      { item: result.item, created: result.created },
      { status: result.created ? 201 : 200 }
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: await te(error.issues[0].message) }, { status: 400 })
    }
    console.error(error)
    return NextResponse.json({ error: await te('아카이브 저장 실패') }, { status: 500 })
  }
}
