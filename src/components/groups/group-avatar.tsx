/** Initial-based group avatar (replaces the old emoji icon). The hue is a stable hash of the
 *  name so a group keeps its colour everywhere; `.gav` maps it to light/dark tints. */
export function groupHue(name: string): number {
  let h = 0
  for (const ch of name) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0
  return h % 360
}

export function groupInitial(name: string): string {
  const first = Array.from(name.trim().replace(/^[^\p{L}\p{N}]+/u, ''))[0] ?? '#'
  return first.toLocaleUpperCase()
}

export function GroupAvatar({ name, size = 40, className = '' }: { name: string; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={`gav ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.44), borderRadius: Math.max(5, Math.round(size * 0.28)), ['--gh' as string]: groupHue(name) }}
    >
      {groupInitial(name)}
    </span>
  )
}
