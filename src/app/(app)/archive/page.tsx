import { redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { ArchiveClient } from './archive-client'
import {
  listBrainForOwner,
  listCollections,
  listHighlightsForItems,
} from '@/lib/data/archive'
import { ARCHIVE_SOURCE_LABEL } from '@/lib/archive-brain-rules'

export default async function ArchivePage() {
  const state = await getUserState()

  if (state.type === 'unauthenticated') {
    redirect('/login')
  }

  if (state.type === 'waitlist') {
    redirect('/waitlist')
  }

  const rawItems = await listBrainForOwner(state.member.id)
  const highlights = await listHighlightsForItems(rawItems.map((i) => i.id))
  const items = rawItems.map((i) => ({
    ...i,
    type_label: ARCHIVE_SOURCE_LABEL[i.source_type],
    highlights: highlights.filter((h) => h.item_id === i.id),
  }))
  const collections = await listCollections(state.member.id)

  return (
    <>
        <ArchiveClient
          member={state.member}
          initialItems={items}
          initialCollections={collections}
        />
      </>
  )
}
