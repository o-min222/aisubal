import { BookOpen, Bot, CalendarDays, Link2, MessageSquare, User, Users, VenetianMask, Wrench } from 'lucide-react'
import type { ArchiveKind } from '@/lib/archive-rules'

export const KIND_ICON: Record<ArchiveKind, typeof Link2> = {
  post: MessageSquare,
  agora: Bot,
  tool: Wrench,
  anon: VenetianMask,
  group: Users,
  moim: CalendarDays,
  member: User,
  link: Link2,
  article: BookOpen,
}
export const hostOf = (u: string | null) => {
  try {
    return u && /^https?:/.test(u) ? new URL(u).hostname.replace(/^www\./, '') : null
  } catch {
    return null
  }
}
