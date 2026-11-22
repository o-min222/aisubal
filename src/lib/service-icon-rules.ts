import { extractGithubOwnerRepo } from '@/lib/toolbox-rules'

/** Where a gallery entry's logo can come from, best first. Pure: no network. */
export type IconSource = { url: string; githubUrl?: string | null; homepageUrl?: string | null }

/** The GitHub owner/org avatar for a repo URL (the logo most projects use), else null. */
export function githubOwnerAvatar(src: IconSource): string | null {
  for (const u of [src.githubUrl, src.url, src.homepageUrl]) {
    const r = u ? extractGithubOwnerRepo(u) : null
    if (r) return `https://github.com/${encodeURIComponent(r.owner)}.png?size=128`
  }
  return null
}

/** The non-GitHub page whose declared icons we read: the homepage, else the submitted URL. */
export function siteForIcons(src: IconSource): string | null {
  for (const u of [src.homepageUrl, src.url]) {
    if (!u) continue
    try {
      const x = new URL(u)
      if (x.protocol === 'https:' && !/(^|\.)github\.com$/i.test(x.hostname)) return x.toString()
    } catch {}
  }
  return null
}

const REL_RANK: Record<string, number> = { 'apple-touch-icon': 3, 'apple-touch-icon-precomposed': 3, icon: 2, 'shortcut icon': 1 }

/** Icons a page declares (<link rel=apple-touch-icon|icon>), biggest and most app-like first, then the conventional paths. */
export function iconCandidates(html: string, pageUrl: string): string[] {
  const found: { href: string; rank: number; size: number }[] = []
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0]
    const rel = tag.match(/\brel\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase().trim()
    const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1]
    if (!rel || !href || !(rel in REL_RANK)) continue
    const size = Number(tag.match(/\bsizes\s*=\s*["'](\d+)x\d+/i)?.[1] ?? (/\.svg(\?|$)/i.test(href) ? 512 : 0))
    try {
      const abs = new URL(href.replace(/&amp;/g, '&'), pageUrl)
      if (abs.protocol === 'https:') found.push({ href: abs.toString(), rank: REL_RANK[rel], size })
    } catch {}
  }
  found.sort((a, b) => b.rank - a.rank || b.size - a.size)
  const origin = new URL(pageUrl).origin
  return [...new Set([...found.map((f) => f.href), `${origin}/apple-touch-icon.png`, `${origin}/favicon.ico`])]
}
