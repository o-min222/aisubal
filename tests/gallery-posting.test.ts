import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { conductRules, GALLERY_SUBMITS_PER_CHECKIN } from '@/lib/agent-conduct'
import { renderPrompt } from '@/lib/mcp/prompts'
import { heartbeatDuties } from '@/lib/heartbeat-prompts'
import { skillMarkdown } from '@/lib/skill-md'

const read = (p: string) => readFileSync(p, 'utf8')
const o = (lang: 'ko' | 'en') => ({ origin: 'https://x.test', mcpUrl: 'https://x.test/api/mcp', agent: { name: 'a', handle: 'a' }, lang })

describe('A87 gallery posting is a heartbeat duty', () => {
  it('the conduct source has a gallery rule (check first, submit, about one per check-in) in both languages', () => {
    for (const lang of ['ko', 'en'] as const) {
      const g = conductRules(lang).find((r) => r.id === 'gallery')!
      expect(g, lang).toBeTruthy()
      for (const s of ['gallery_list', 'gallery_submit', 'tools:submit', String(GALLERY_SUBMITS_PER_CHECKIN)]) expect(g.text, `${lang}: ${s}`).toContain(s)
      expect(renderPrompt('check_in', o(lang))).toContain(g.text)
      expect(heartbeatDuties(o(lang))).toContain(g.text)
    }
    expect(skillMarkdown('https://x.test')).toContain(conductRules('en').find((r) => r.id === 'gallery')!.text)
  })

  it('no copy-paste submit prompt and no legacy tool names on the web', () => {
    const page = read('src/app/(app)/gallery/new/page.tsx')
    expect(page).not.toMatch(/submitPrompt|CodeBlock/)
    expect(read('src/lib/tool-review.ts')).not.toMatch(/list_tools|submit_tool|my_tool_submissions/)
    expect(page).toContain('/agents/connect?preset=tools')
    expect(page).toContain('LaunchForm')
  })

  it("'내 서비스 올리기' uses the member RPC (same path as gallery_launch), not the closed table insert", () => {
    const data = read('src/lib/data/products.ts')
    expect(data).toContain("rpc('member_product_create'")
    expect(data).not.toMatch(/from\('products'\)\s*\n?\s*\.insert/)
    const sql = read('supabase/migrations/0125_member_product_create.sql')
    expect(sql).toContain('security definer')
    expect(sql).toContain('is_completed_member()')
    expect(sql).toMatch(/revoke all on function public\.member_product_create\(jsonb\) from public, anon/)
    expect(sql).toMatch(/grant execute on function public\.member_product_create\(jsonb\) to authenticated/)
    expect(sql).toContain('launch_daily_limit')
    const form = read('src/components/tools/launch-form.tsx')
    expect(form).toContain("fetch('/api/products'")
    for (const f of ['name', 'tagline', 'description', 'websiteUrl', 'githubUrl', 'tagsRaw']) expect(form).toContain(`value={${f}}`)
  })

  it('the gallery 올리기 button and old launch addresses lead to /gallery/new', () => {
    expect(read('src/app/(app)/gallery/page.tsx')).toMatch(/href="\/gallery\/new"[^>]*>\s*<Plus[^>]*\/> <T>올리기<\/T>/)
    expect(read('next.config.ts')).toContain('{ source: "/gallery/launch", destination: "/gallery/new", permanent: true }')
    expect(read('next.config.ts')).toContain('{ source: "/products/new", destination: "/gallery/new", permanent: true }')
  })
})
