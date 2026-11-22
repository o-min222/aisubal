import { Globe, PenLine } from 'lucide-react'
import type { LinkKind } from '@/lib/profile-rules'

const BRAND: Record<Exclude<LinkKind, 'blog' | 'website'>, { bg: string; fg: string; glyph: React.ReactNode }> = {
  x: { bg: '#000', fg: '#fff', glyph: <path d="M5 5l14 14M19 5L5 19" strokeWidth={2.4} strokeLinecap="round" /> },
  instagram: {
    bg: 'linear-gradient(45deg,#f9ce34,#ee2a7b,#6228d7)',
    fg: '#fff',
    glyph: (
      <>
        <rect x="5" y="5" width="14" height="14" rx="4" strokeWidth={2} fill="none" />
        <circle cx="12" cy="12" r="3.2" strokeWidth={2} fill="none" />
        <circle cx="16.3" cy="7.7" r="0.9" fill="currentColor" stroke="none" />
      </>
    ),
  },
  threads: { bg: '#000', fg: '#fff', glyph: <text x="12" y="16.5" textAnchor="middle" fontSize="13" fontWeight="700" fill="currentColor" stroke="none">@</text> },
  linkedin: { bg: '#0A66C2', fg: '#fff', glyph: <text x="12" y="16.5" textAnchor="middle" fontSize="11.5" fontWeight="800" fill="currentColor" stroke="none">in</text> },
  github: {
    bg: '#181717',
    fg: '#fff',
    glyph: <path fill="currentColor" stroke="none" d="M12 4.3a7.7 7.7 0 0 0-2.4 15c.4.1.5-.2.5-.4v-1.4c-2.1.5-2.6-1-2.6-1-.3-.9-.8-1.1-.8-1.1-.7-.5.1-.5.1-.5.8.1 1.2.8 1.2.8.7 1.2 1.8.8 2.2.6.1-.5.3-.8.5-1-1.7-.2-3.5-.9-3.5-3.8 0-.8.3-1.5.8-2.1-.1-.2-.3-1 .1-2 0 0 .6-.2 2.1.8a7.3 7.3 0 0 1 3.8 0c1.5-1 2.1-.8 2.1-.8.4 1 .2 1.8.1 2 .5.6.8 1.3.8 2.1 0 3-1.8 3.6-3.5 3.8.3.2.5.7.5 1.4v2.1c0 .2.1.5.5.4A7.7 7.7 0 0 0 12 4.3z" />,
  },
  youtube: { bg: '#FF0000', fg: '#fff', glyph: <path d="M10 8.5v7l6-3.5z" fill="currentColor" stroke="none" /> },
  tiktok: { bg: '#000', fg: '#fff', glyph: <path d="M13 5v9.5a2.8 2.8 0 1 1-2.8-2.8M13 5c.4 2 1.8 3.3 3.8 3.5" strokeWidth={2} fill="none" strokeLinecap="round" /> },
  facebook: { bg: '#1877F2', fg: '#fff', glyph: <text x="12.5" y="17.5" textAnchor="middle" fontSize="15" fontWeight="800" fill="currentColor" stroke="none">f</text> },
  bluesky: { bg: '#0085FF', fg: '#fff', glyph: <path d="M12 11.5c-1.2-2.4-4.5-6.1-6-5.4-1.3.6-.4 4.4.6 5.3 1 .9 2.7.9 3.6.6-1.7.6-3.4 1.6-2 3.4 1.6 2 3.1-.6 3.8-2.4.7 1.8 2.2 4.4 3.8 2.4 1.4-1.8-.3-2.8-2-3.4.9.3 2.6.3 3.6-.6 1-.9 1.9-4.7.6-5.3-1.5-.7-4.8 3-6 5.4z" fill="currentColor" stroke="none" /> },
  huggingface: { bg: '#FFD21E', fg: '#111', glyph: <text x="12" y="16.8" textAnchor="middle" fontSize="12" stroke="none">🤗</text> },
}

/** Small brand-colored badge for a profile link. */
export function LinkIcon({ kind, size = 28 }: { kind: LinkKind; size?: number }) {
  if (kind === 'blog' || kind === 'website') {
    const I = kind === 'blog' ? PenLine : Globe
    return (
      <span aria-hidden className="inline-flex items-center justify-center rounded-lg flex-shrink-0" style={{ width: size, height: size, background: 'var(--n-eef0f3)', color: 'var(--n-333)' }}>
        <I style={{ width: size * 0.55, height: size * 0.55 }} />
      </span>
    )
  }
  const b = BRAND[kind]
  return (
    <span aria-hidden className="inline-flex items-center justify-center rounded-lg flex-shrink-0" style={{ width: size, height: size, background: b.bg, color: b.fg }}>
      <svg viewBox="0 0 24 24" width={size * 0.78} height={size * 0.78} stroke="currentColor" fill="none">
        {b.glyph}
      </svg>
    </span>
  )
}
