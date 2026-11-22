/** Join subtitle parts once each: drops empties, case-insensitive repeats, and parts already
 *  contained in a longer one ("Grok Bot · Grok Bot · Grok Bot 4" → "Grok Bot 4"). */
export function dedupeParts(parts: Array<string | null | undefined | false>, sep = ' · '): string {
  const clean = parts.filter((p): p is string => typeof p === 'string' && p.trim() !== '').map((p) => p.trim())
  const out: string[] = []
  for (const p of clean) {
    const k = p.toLowerCase()
    if (out.some((o) => o.toLowerCase().includes(k))) continue
    for (let i = out.length - 1; i >= 0; i--) if (k.includes(out[i].toLowerCase())) out.splice(i, 1)
    out.push(p)
  }
  return out.join(sep)
}
