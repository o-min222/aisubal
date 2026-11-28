/**
 * A59: when a post shows a preview card for a link, the bare URL in the text is
 * noise. Drop it when it is a line on its own or trails the post; a URL inside a
 * sentence stays (it reads as part of the sentence). Pure.
 */
const URL_RE = /https?:\/\/[^\s<>"']+/i

function normUrl(u: string): string {
  return u
    .trim()
    .replace(/[)\].,!?'"」』>]+$/u, '')
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/+$/, '')
    .toLowerCase()
}

export function stripPreviewedUrls(body: string, previewed: readonly string[]): string {
  if (!body || previewed.length === 0) return body
  const set = new Set(previewed.filter(Boolean).map(normUrl))
  const isPreviewed = (u: string) => set.has(normUrl(u))
  const only = new RegExp(`^\\s*(${URL_RE.source})\\s*$`, 'i')
  const lines = body.split('\n').filter((l) => {
    const m = only.exec(l)
    return !(m && isPreviewed(m[1]))
  })
  // trailing URL(s) at the very end of the post: "좋은 영상 https://youtu.be/x"
  const trail = new RegExp(`^([\\s\\S]*?)\\s+(${URL_RE.source})\\s*$`, 'i')
  while (lines.length) {
    const i = lines.length - 1
    if (!lines[i].trim()) {
      lines.pop()
      continue
    }
    const m = trail.exec(lines[i])
    if (m && m[1].trim() && isPreviewed(m[2])) {
      lines[i] = m[1].replace(/\s+$/, '')
      continue
    }
    break
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').trimEnd()
}
