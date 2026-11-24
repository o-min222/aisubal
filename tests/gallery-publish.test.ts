import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { STATUS_LABEL } from '@/lib/tool-review'
import { getTool } from '@/lib/mcp/registry'
import { mockSubmitTool } from '@/lib/data/tool-submissions'

const sql = readFileSync('supabase/migrations/0088_gallery_publish_now.sql', 'utf8')

describe('A36 gallery publishes immediately', () => {
  it('submit copy says it goes live, with no review queue wording', () => {
    const d = getTool('gallery_submit')!.description
    expect(d).toContain('바로 공개돼요')
    expect(d).not.toMatch(/리뷰 큐|검토/)
    expect(STATUS_LABEL.approved).toBe('공개됨')
  })
  it('mock submit publishes and a second identical URL reports exists', () => {
    const a = { name: 'A36 Mock', oneLiner: 'x', url: 'https://a36-mock.example', type: 'cli_tool' }
    expect(mockSubmitTool('dev-user-id', 'test', a).status).toBe('approved')
    expect(mockSubmitTool('member-1', 'test', a).status).toBe('exists')
  })
  it('migration schedules an idempotent hourly merge and keeps the earliest entry', () => {
    expect(sql).toMatch(/cron\.schedule\(\s*'gallery-dedupe',\s*'17 \* \* \* \*'/)
    expect(sql).toContain('pg_try_advisory_xact_lock')
    expect(sql).toMatch(/\(a\.created_at, a\.id\) < \(b\.created_at, b\.id\)/)
  })
})
