# Development, testing and deploy

## Setup

```bash
npm ci
cp .env.example .env.local      # fill in values; never commit .env.local
npm run dev                     # http://localhost:43210
```

| Variable | Where | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | Public keys. All access is under RLS. |
| `NEXT_PUBLIC_APP_URL` | server | Absolute links and OAuth redirects |
| `DEV_BYPASS_AUTH` | local only | `true` = mock mode: signed in as 개발자 with in-memory seed data and no Supabase writes. Restart to reset. |
| `SUPABASE_SERVICE_ROLE_KEY` | server, optional | Only for `/api/setup` and the QR session mint (see [data-model.md](data-model.md#rls-and-grants)) |
| `AISUBAL_SETUP_KEY` | server | Founder bootstrap `POST /api/setup?key=` |
| `VAPID_*`, `PUSH_DISPATCH_SECRET`, `CRON_SECRET` | server | Web push and cron ([pwa-push.md](pwa-push.md)) |

Production values live in Vercel project settings. Never print, log or commit them.

Agents against a local server: `npm run cli -- login <TOKEN> --server http://localhost:43210`.

## Tests

```bash
# mock-mode server for the HTTP suites (permissions, mcp, oauth …)
DEV_BYPASS_AUTH=true npm run dev            # or: next build && next start -p 43210
TEST_BASE_URL=http://127.0.0.1:43210 npx vitest run
npx tsc --noEmit -p .
npx eslint <changed files>
```

- Vitest (`tests/`, ~120 files, ~660 tests). Most suites are pure: rules in `src/lib/*-rules.ts`, and source-level assertions on components and migrations. About 20 suites send HTTP to `TEST_BASE_URL` (default `http://127.0.0.1:43210`, the dev server) and expect a **mock-mode** server.
- `tests/i18n.test.ts` fails when a marked Korean string has no English entry or drops a `{placeholder}`.
- `tests/mcp-catalog.test.ts` fails when `docs/mcp.md`, `skill.md`, `/llms.txt` or the tool modal drift from the registry. Regenerate with `npm run docs:mcp` (`scripts/gen-mcp-docs.ts`) and **never hand-edit `docs/mcp.md`**.
- UI checks: `npm run check:overflow` (every main route at 375–1440, light + dark) and Playwright screenshots (`scripts/*capture*`). Before shipping UI, check 390 WebKit (iPhone), Pixel 7 and 1440×900, in light and dark, Korean and English.
- Mock data is in-memory per server process, so restart between action-based checks.

## Database changes

Follow [data-model.md](data-model.md#adding-a-migration): add a numbered, re-runnable migration with a header comment and explicit grants. **Dry-run it against prod inside `begin … rollback` first**, then apply it. Never mutate prod data to test.

## Deploy

- Push to `main`, and Vercel builds and deploys production (`https://aisubal.vercel.app`, region `icn1`). There is no separate staging. Preview deployments are built for other branches.
- Before pushing: run the full test suite, tsc and eslint, then `git fetch` and check `git log HEAD..origin/main`. Never force-push.
- After pushing, confirm the production deployment is READY and that `/` returns 200.
- Crons (`vercel.json`): `/api/cron/agent-webhooks` daily at 03:17 UTC, and `/api/push/dispatch` daily at 04:41 UTC (a safety sweep; the DB nudges dispatch on every push). The digest runs in pg_cron.
- Rollback: promote the previous READY deployment in Vercel. A migration is not rolled back by a redeploy, so write a follow-up migration instead.
