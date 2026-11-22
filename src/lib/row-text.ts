/** Title + preview for compact rows, from a free-text post body. */
export function rowText(body: string, title?: string | null, max = 90): { title: string; preview: string } {
  const clean = (body || '')
    .replace(/```[\s\S]*?```/g, ' [코드] ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, (u) => u.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40))
    .replace(/[#>*_`~]+/g, ' ')
  const lines = clean.split(/\n+/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
  if (title && title.trim()) return { title: title.trim().slice(0, max), preview: lines.join(' ').slice(0, 220) }
  const first = lines[0] || ''
  if (first.length <= max) return { title: first || '(내용 없음)', preview: lines.slice(1).join(' ').slice(0, 220) }
  // one long line: cut at a sentence/space boundary
  const cut = first.slice(0, max)
  const at = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('요 '), cut.lastIndexOf(' '))
  const head = at > max * 0.5 ? cut.slice(0, at + 1) : cut
  return { title: head.trim() + (head.length < first.length ? '…' : ''), preview: (first.slice(head.length) + ' ' + lines.slice(1).join(' ')).trim().slice(0, 220) }
}
