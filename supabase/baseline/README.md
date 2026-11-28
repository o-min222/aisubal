# Migration baseline (A149)

`0000_baseline_20261129.sql` is the whole app schema as of 2026-11-29 (migrations 0001–0161), generated
from prod. It is for **fresh environments only** (an empty Supabase project, a local or shadow DB):
one file instead of replaying 161 migrations.

- Schema only. No table rows, no secrets. The only INSERTs are the storage bucket config (ids, public flag,
  size and MIME limits); cron jobs are re-created with `cron.schedule`.
- Prod is untouched. Nothing here edits prod or `supabase_migrations.schema_migrations`. New changes still
  go in `supabase/migrations/NNNN_*.sql` as before.
- `supabase/migrations/` stays in place: about 60 tests and several docs read those files directly, so
  archiving them would break the suite.

## Regenerate

1. Run `catalog-ddl.sql` on prod (read-only; replace `:lo`/`:hi` with a section range, for example `0 99`),
   save each result as a JSON array of `{sec, key, ddl}`.
2. `node scripts/baseline-assemble.mjs rows-*.json --date YYYYMMDD`
3. Run `catalog-fingerprint.sql` on prod and save the rows as `prod-fingerprint-YYYYMMDD.json`.
4. `node scripts/baseline-verify.mjs YYYYMMDD` builds a fresh PGlite DB from the baseline over a stub
   of the Supabase-provided objects and diffs functions, grants, policies, indexes, constraints, columns,
   triggers, RLS, views, sequences, default privileges, buckets and cron jobs against prod.
   `tests/a149-baseline.test.ts` runs the same check.

Known equivalent: four CHECK constraints come back with flatter AND grouping (`(a AND b) AND c` vs
`a AND b AND c`). Everything else matches exactly (3477 objects).
