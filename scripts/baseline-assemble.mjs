#!/usr/bin/env node
/**
 * A149: writes supabase/baseline/0000_baseline_<date>.sql from the rows that
 * supabase/baseline/catalog-ddl.sql returns on prod (read-only; schema only, no data, no secrets).
 *   node scripts/baseline-assemble.mjs <rows.json>... [--date 20261129]
 * Each rows file is a JSON array of {sec, key, ddl}. Sections run in dependency order:
 * sequences → tables → functions (bodies unchecked) → views → defaults → constraints → FKs →
 * indexes → triggers → RLS → policies → privileges → comments → bucket config → cron jobs.
 */
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const di = args.indexOf('--date')
const date = di >= 0 ? args.splice(di, 2)[1] : new Date().toISOString().slice(0, 10).replace(/-/g, '')
const rows = args.flatMap((f) => JSON.parse(fs.readFileSync(f, 'utf8')))
rows.sort((a, b) => a.sec - b.sec || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))

const SECTION = {
  10: 'sequences', 20: 'tables', 30: 'functions', 35: 'views', 40: 'column defaults', 45: 'sequence ownership',
  50: 'primary key, unique, check, exclusion constraints', 55: 'foreign keys', 60: 'indexes', 65: 'triggers',
  70: 'row level security', 75: 'policies', 80: 'table privileges', 81: 'column privileges', 82: 'function privileges',
  85: 'schema privileges', 86: 'default privileges', 88: 'comments', 90: 'storage buckets (config only)', 95: 'cron jobs',
}

export const HEADER = `-- Baseline schema for fresh environments, generated ${date} from prod (qelrlawrqeffmwcclpsz) by
-- supabase/baseline/catalog-ddl.sql + scripts/baseline-assemble.mjs. Schema only: no rows, no secrets.
-- Equivalent to supabase/migrations/0001..0161 applied in order (verified by tests/a149-baseline.test.ts).
-- It does NOT replace prod migration history; apply it only to an empty Supabase project.
BEGIN;
SET check_function_bodies = false;
SET client_min_messages = warning;
SELECT pg_catalog.set_config('search_path', '', false);

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE SCHEMA IF NOT EXISTS anon_private;
`

let out = HEADER
let sec = null
for (const r of rows) {
  if (r.sec !== sec) { sec = r.sec; out += `\n-- ${sec} ${SECTION[sec] ?? ''}\n` }
  out += r.ddl.trimEnd() + '\n'
}
out += '\nCOMMIT;\n'
const file = path.join('supabase/baseline', `0000_baseline_${date}.sql`)
fs.writeFileSync(file, out)
console.log(file, rows.length, 'statements', (out.length / 1024).toFixed(0) + ' KB')
