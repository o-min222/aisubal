#!/usr/bin/env node
/**
 * A149: builds a fresh in-memory Postgres 17 (PGlite) from supabase/baseline/0000_baseline_<date>.sql on
 * top of a stub of what Supabase provides (roles, auth.uid/users, storage.objects/buckets, cron, net),
 * then compares its catalog fingerprint with the one taken from prod.
 *   node scripts/baseline-verify.mjs [date]   → exit 1 and a diff when anything differs
 */
import fs from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'

export const SUPABASE_STUB = `
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE ROLE supabase_auth_admin NOLOGIN; CREATE ROLE supabase_storage_admin NOLOGIN; CREATE ROLE dashboard_user NOLOGIN;
CREATE SCHEMA extensions; CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA cron; CREATE SCHEMA net; CREATE SCHEMA vault;
GRANT USAGE ON SCHEMA public, auth, storage, extensions TO anon, authenticated, service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.role', true), '') $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb, raw_app_meta_data jsonb, created_at timestamptz DEFAULT now());
CREATE TABLE storage.buckets (id text PRIMARY KEY, name text NOT NULL, owner uuid, public boolean DEFAULT false, file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text REFERENCES storage.buckets(id), name text, owner uuid, owner_id text, metadata jsonb, created_at timestamptz DEFAULT now());
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
CREATE FUNCTION storage.filename(name text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)] $$;
CREATE FUNCTION storage.extension(name text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT reverse(split_part(reverse(name), '.', 1)) $$;
CREATE TABLE cron.job (jobid bigserial PRIMARY KEY, jobname text UNIQUE, schedule text, command text);
CREATE FUNCTION cron.schedule(job_name text, schedule text, command text) RETURNS bigint LANGUAGE sql AS $$
  INSERT INTO cron.job (jobname, schedule, command) VALUES (job_name, schedule, command)
  ON CONFLICT (jobname) DO UPDATE SET schedule = excluded.schedule, command = excluded.command RETURNING jobid $$;
CREATE FUNCTION net.http_post(url text, body jsonb DEFAULT '{}', params jsonb DEFAULT '{}', headers jsonb DEFAULT '{}', timeout_milliseconds int DEFAULT 5000) RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;
CREATE TABLE vault.decrypted_secrets (name text, decrypted_secret text);
`

export async function buildFromBaseline(file) {
  const db = new PGlite({ extensions: { btree_gist, pgcrypto, uuid_ossp } })
  await db.exec(SUPABASE_STUB)
  // pg_net and pg_cron are Supabase extensions; the stub above stands in for them
  const sql = fs.readFileSync(file, 'utf8').replace(/^CREATE EXTENSION IF NOT EXISTS (pg_net|pg_cron)\b.*$/gm, '')
  await db.exec(sql)
  return db
}

export async function fingerprint(db) {
  const q = fs.readFileSync('supabase/baseline/catalog-fingerprint.sql', 'utf8')
  const res = await db.exec(q)
  return res[res.length - 1].rows
}

export function diff(prod, fresh) {
  const key = (r) => r.kind + '\u0000' + r.key
  const a = new Map(prod.map((r) => [key(r), r.val])), b = new Map(fresh.map((r) => [key(r), r.val]))
  const out = []
  for (const [k, v] of a) if (!b.has(k)) out.push(['missing', k, v]); else if (b.get(k) !== v) out.push(['differs', k, v, b.get(k)])
  for (const [k, v] of b) if (!a.has(k)) out.push(['extra', k, v])
  return out.map((d) => [d[0], d[1].replace('\u0000', ' '), ...d.slice(2)])
}

// The deparser keeps the parse tree's grouping: prod's ((a AND b) AND c) comes back from the
// baseline text as (a AND b AND c). Same tokens, only AND grouping differs → equivalent.
export const andGroupingOnly = (d) =>
  d[0] === 'differs' && /^con /.test(d[1]) && d[2].replace(/[()]/g, '') === d[3].replace(/[()]/g, '') && /\(\(\(.* AND .*\) AND /.test(d[2])

export function verify(prod, fresh) {
  const all = diff(prod, fresh)
  return { real: all.filter((d) => !andGroupingOnly(d)), equivalent: all.filter(andGroupingOnly) }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const date = process.argv[2] ?? '20261129'
  const db = await buildFromBaseline(path.join('supabase/baseline', `0000_baseline_${date}.sql`))
  const fresh = await fingerprint(db)
  const prod = JSON.parse(fs.readFileSync(path.join('supabase/baseline', `prod-fingerprint-${date}.json`), 'utf8'))
  const { real, equivalent } = verify(prod, fresh)
  const kinds = {}; for (const r of prod) kinds[r.kind] = (kinds[r.kind] || 0) + 1
  console.log('prod objects', prod.length, JSON.stringify(kinds))
  console.log('fresh objects', fresh.length, 'differences', real.length, 'equivalent (AND grouping)', equivalent.map((d) => d[1]).join(', ') || 0)
  for (const x of real.slice(0, 40)) console.log(JSON.stringify(x).slice(0, 400))
  process.exit(real.length ? 1 : 0)
}
