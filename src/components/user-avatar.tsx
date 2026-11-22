'use client'

import { getAvatarColor } from '@/lib/markdown'
import type { PublicAuthor } from '@/lib/supabase/types'
import { publicAuthorLabel } from '@/lib/profile'

export function UserAvatar({
  id,
  name,
  avatarUrl,
  size = 'md',
}: {
  id: string
  name: string
  avatarUrl?: string | null
  size?: 'sm' | 'md' | 'lg'
}) {
  const sizeClass = size === 'sm' ? 'avatar-sm' : size === 'lg' ? 'avatar-lg' : ''
  const bg = getAvatarColor(id, name)

  if (avatarUrl) {
    return (
      <div className={`avatar ${sizeClass}`}>
        <img src={avatarUrl} alt={name} />
      </div>
    )
  }

  return (
    <div
      className={`avatar ${sizeClass}`}
      style={{ background: bg, color: '#fff' }}
      title={name}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

export function AuthorAvatar({
  author,
  size = 'sm',
}: {
  author: PublicAuthor
  size?: 'sm' | 'md' | 'lg'
}) {
  const name = publicAuthorLabel(author)
  return (
    <UserAvatar
      id={author.id}
      name={name}
      avatarUrl={author.avatar_url}
      size={size}
    />
  )
}
