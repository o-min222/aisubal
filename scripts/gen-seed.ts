import { writeFileSync } from 'fs'
import { MUTABLE_TOOLBOX } from '../src/lib/mock-toolbox'

function esc(s: string | null | undefined): string {
  if (s == null) return 'NULL'
  return `'${String(s).replace(/'/g, "''")}'`
}

function arr(a: string[]): string {
  return `ARRAY[${a.map((t) => esc(t)).join(',')}]::text[]`
}

function uuidFromSlug(slug: string, i: number): string {
  let h = 0
  for (const c of slug) h = (h * 31 + c.charCodeAt(0)) >>> 0
  const hex = (h.toString(16) + 'a1b2c3d4e5f67890abcdef').slice(0, 12)
  const n = (i + 1).toString(16).padStart(4, '0')
  return `a0000000-0000-4000-8${n.slice(0, 3)}-${hex}`
}

const lines: string[] = [
  '-- AI쓰발 optional seed — toolbox demo catalog',
  '-- Apply AFTER supabase/migrations/0001_init.sql',
  '-- Does not create auth.users / members (created_by_id NULL).',
  '-- Idempotent via ON CONFLICT (canonical_url).',
  '',
  'INSERT INTO public.toolbox_entries (',
  '  id, name, slug, one_liner, description, type, tags, icon_url,',
  '  canonical_url, github_url, homepage_url, license, last_commit_at,',
  '  source_repo, install_snippets, mention_count, install_count,',
  '  avg_rating, rating_count, created_by_id, featured, created_at, updated_at',
  ') VALUES',
]

const vals = MUTABLE_TOOLBOX.map((t, i) => {
  const uuid = uuidFromSlug(t.slug, i)
  return `(${[
    esc(uuid),
    esc(t.name),
    esc(t.slug),
    esc(t.one_liner),
    esc(t.description),
    esc(t.type),
    arr(t.tags),
    'NULL',
    esc(t.canonical_url),
    esc(t.github_url),
    esc(t.homepage_url),
    esc(t.license),
    t.last_commit_at ? esc(t.last_commit_at) : 'NULL',
    esc(t.source_repo),
    `${esc(JSON.stringify(t.install_snippets))}::jsonb`,
    t.mention_count,
    t.install_count,
    t.avg_rating,
    t.rating_count,
    'NULL',
    t.featured,
    esc(t.created_at),
    esc(t.updated_at),
  ].join(', ')})`
})

lines.push(vals.join(',\n'))
lines.push(`ON CONFLICT (canonical_url) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  one_liner = EXCLUDED.one_liner,
  description = EXCLUDED.description,
  type = EXCLUDED.type,
  tags = EXCLUDED.tags,
  github_url = EXCLUDED.github_url,
  homepage_url = EXCLUDED.homepage_url,
  license = EXCLUDED.license,
  last_commit_at = EXCLUDED.last_commit_at,
  source_repo = EXCLUDED.source_repo,
  install_snippets = EXCLUDED.install_snippets,
  install_count = EXCLUDED.install_count,
  avg_rating = EXCLUDED.avg_rating,
  rating_count = EXCLUDED.rating_count,
  featured = EXCLUDED.featured,
  updated_at = NOW();
`)

lines.push(`
-- Reinforce site defaults (also in 0001_init)
INSERT INTO public.site_config (key, value) VALUES
  ('nickname_unlock_threshold', '100'),
  ('invites_per_member', '2'),
  ('site_name', 'AI쓰발')
ON CONFLICT (key) DO NOTHING;
`)

writeFileSync('supabase/seed.sql', lines.join('\n'))
console.log(`Wrote supabase/seed.sql (${MUTABLE_TOOLBOX.length} toolbox entries)`)
