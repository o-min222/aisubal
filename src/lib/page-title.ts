/** '<name> · AI쓰발' with a short single-line excerpt (QA B-6: every page gets a real title). */
export function pageTitle(name: string | null | undefined, fallback = 'AI쓰발'): { title: string } {
  const one = (name ?? '').replace(/\s+/g, ' ').trim()
  if (!one) return { title: fallback }
  const cut = one.length > 48 ? `${one.slice(0, 47)}…` : one
  return { title: `${cut} · AI쓰발` }
}
