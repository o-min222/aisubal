import { Sparkles } from 'lucide-react'
import { AUTHORSHIP_CHIP, type Authorship } from '@/lib/authorship'
import { T } from '@/i18n/t'

/** 'AI 도움' / 'AI 작성' (author-declared). Human-written posts show nothing. */
export function AuthorshipChip({ value, className = 'authorship-chip' }: { value?: Authorship | null; className?: string }) {
  const label = value ? AUTHORSHIP_CHIP[value] : null
  if (!label) return null
  return (
    <span className={className} data-authorship={value}>
      <Sparkles className="w-3 h-3" aria-hidden />
      <T>{label}</T>
    </span>
  )
}
