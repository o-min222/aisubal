import { NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import {
  exportCollectionPack,
  listBrainForOwner,
  listCollections,
} from '@/lib/data/archive'
import { slugify } from '@/lib/archive-brain-rules'

export async function GET(request: NextRequest) {
  const member = await getMember()
  if (!member) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const sp = request.nextUrl.searchParams
  const collectionId = sp.get('collection')
  const format = sp.get('format') || 'markdown'
  const asJson = sp.get('json') === '1'

  if (collectionId) {
    const pack = await exportCollectionPack(collectionId, member.id)
    if (!pack) {
      return NextResponse.json({ error: '컬렉션을 찾을 수 없습니다.' }, { status: 404 })
    }

    if (asJson || format === 'pack') {
      return NextResponse.json({
        collection: pack.collection,
        llms_txt: pack.llmsTxt,
        skill_md: pack.skillMd,
        markdown: pack.markdown,
        files: [
          { path: 'llms.txt', content: pack.llmsTxt },
          { path: 'SKILL.md', content: pack.skillMd },
          { path: 'README.md', content: pack.markdown },
          ...pack.files.map((f) => ({
            path: `items/${f.filename}`,
            content: f.content,
          })),
        ],
      })
    }

    const body =
      format === 'skill'
        ? pack.skillMd
        : format === 'llms'
          ? pack.llmsTxt
          : pack.markdown

    const filename =
      format === 'skill'
        ? `SKILL-${slugify(pack.collection.name)}.md`
        : format === 'llms'
          ? 'llms.txt'
          : `${slugify(pack.collection.name)}-context.md`

    return new NextResponse(body, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename=${filename}`,
      },
    })
  }

  const items = await listBrainForOwner(member.id)
  if (asJson) {
    const collections = await listCollections(member.id)
    return NextResponse.json({
      items,
      collections: collections.filter((c) => c.owner_id === member.id),
    })
  }

  const text = items
    .map(
      (i) =>
        `# ${i.title}\nType: ${i.source_type}\nTags: ${i.tags.join(', ')}\n\n${i.content_text}\n`
    )
    .join('\n---\n\n')

  return new NextResponse(text, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': 'attachment; filename=archive-brain.md',
    },
  })
}
