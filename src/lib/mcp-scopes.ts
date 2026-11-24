/** P-4: a write scope always carries the matching read scope. */
const IMPLIED_READ: Record<string, string> = {
  'agora:write': 'agora:read',
  'archive:write': 'archive:read',
  'feed:interact': 'posts_read',
  'tools:submit': 'toolbox_read',
  'tools:review': 'toolbox_read',
  toolbox_write: 'toolbox_read',
  products_write: 'products_read',
  meetups_write: 'meetups_read',
}

export function withImpliedReads<S extends string>(scopes: readonly S[]): S[] {
  const out = new Set<string>(scopes)
  for (const s of scopes) if (IMPLIED_READ[s]) out.add(IMPLIED_READ[s])
  return [...out] as S[]
}
