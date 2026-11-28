import { createHash } from 'node:crypto'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { McpContext, type ToolFilter } from '@/lib/mcp/dispatch'
import { SERVER_CAPABILITIES, buildServer } from '@/lib/mcp/server'
import { SKILLS_EXTENSION_ID, SKILL_URI, getSkill, listSkills, readSkillDirectory, readSkillFile } from '@/lib/mcp/skills'
import { MODERN_PROTOCOL_VERSION, SUPPORTED_VERSIONS, modernize, requestedVersion, versionError } from '@/lib/mcp/modern'
import { memberToolSpecs } from '@/lib/mcp/registry'
import { AGENT_CAPS } from '@/lib/agent-conduct'
import { connectScopes } from '@/lib/agent-connect'
import { skillBundle, skillMarkdown } from '@/lib/skill-md'
import { mcpDocsMarkdown } from '@/lib/mcp/catalog'
import { llmsTxt } from '@/lib/llms-txt'

const ORIGIN = 'https://x.test'

/** a member agent's token with fixed scopes and default caps (no network) */
class Ctx extends McpContext {
  override readonly dev = false
  constructor(private readonly f: ToolFilter) {
    super(null, ORIGIN)
  }
  override filter() {
    return Promise.resolve(this.f)
  }
  override caps() {
    return Promise.resolve({ ...AGENT_CAPS })
  }
}

async function connect(scopes = connectScopes(false, false)) {
  const server = await buildServer(new Ctx({ scopes, isAdmin: false }), { initialize: false })
  const [a, b] = InMemoryTransport.createLinkedPair()
  await server.connect(a)
  const client = new Client({ name: 'test', version: '0' })
  await client.connect(b)
  return client
}
type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any -- loose JSON-RPC results
const Any = z.object({}).passthrough()
const ask = (c: Client, method: string, params: Record<string, unknown> = {}) => c.request({ method, params }, Any) as Promise<Json>
const sha = (s: string) => `sha256:${createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex')}`

describe('A130 · MCP Skills extension', () => {
  it('declares the extension next to resources, in initialize (2025-11-25) and server/discover', async () => {
    const c = await connect()
    const caps = c.getServerCapabilities() as Json
    expect(caps.resources).toBeTruthy()
    expect(caps.extensions[SKILLS_EXTENSION_ID]).toEqual({ directoryRead: true })
    expect(caps).toMatchObject({ tools: {}, prompts: {} })
    expect(SERVER_CAPABILITIES.extensions[SKILLS_EXTENSION_ID].directoryRead).toBe(true)
  })

  it('skills/list: one skill, verbatim frontmatter, complete manifest with real digests and sizes, cache fields', async () => {
    const r = await ask(await connect(), 'skills/list')
    expect(r.resultType).toBe('complete')
    expect(r.ttlMs).toBeGreaterThanOrEqual(0)
    expect(['public', 'private']).toContain(r.cacheScope)
    expect(r.skills).toHaveLength(1)
    const s = r.skills[0]
    expect(s.uri).toBe('skill://aisubal/SKILL.md')
    expect(s.frontmatter.name).toBe('aisubal')
    expect(s.frontmatter.description.length).toBeGreaterThan(20)
    expect(s.resources.map((x: { uri: string }) => x.uri)).toEqual([
      'skill://aisubal/SKILL.md',
      'skill://aisubal/references/etiquette.md',
      'skill://aisubal/references/webhook.md',
      'skill://aisubal/references/tools.md',
    ])
    const c = await connect()
    for (const f of s.resources as Array<{ uri: string; digest: string; size: number }>) {
      const read = await ask(c, 'resources/read', { uri: f.uri })
      const text = read.contents[0].text as string
      expect(f.size).toBe(Buffer.byteLength(text, 'utf8'))
      expect(f.digest).toBe(sha(text))
      expect(read.contents[0].mimeType).toBe('text/markdown')
    }
  })

  it('skills/get returns the same entry; an unknown or non-skill URI is -32602', async () => {
    const c = await connect()
    const list = await ask(c, 'skills/list')
    const got = await ask(c, 'skills/get', { uri: SKILL_URI })
    expect(got.resultType).toBe('complete')
    expect(got.skill).toEqual(list.skills[0])
    for (const uri of ['skill://aisubal/nope/SKILL.md', 'skill://other/SKILL.md', 'skill://aisubal/references/tools.md', 'https://x.test/skill.md']) {
      await expect(ask(c, 'skills/get', { uri })).rejects.toMatchObject({ code: -32602 })
    }
  })

  it('the SKILL.md frontmatter equals the entry and follows the Agent Skills naming rules', async () => {
    const r = await ask(await connect(), 'resources/read', { uri: SKILL_URI })
    const text = r.contents[0].text as string
    const m = text.match(/^---\n([\s\S]*?)\n---\n/)!
    const lines = m[1].split('\n')
    const top = Object.fromEntries(lines.filter((l) => /^\w/.test(l) && !l.endsWith(':')).map((l) => [l.slice(0, l.indexOf(':')), JSON.parse(l.slice(l.indexOf(':') + 2))]))
    const entry = getSkill(SKILL_URI, ORIGIN)!.frontmatter
    expect(top.name).toBe(entry.name)
    expect(top.description).toBe(entry.description)
    expect(top.compatibility).toBe(entry.compatibility)
    expect(entry.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    expect((entry.name as string).length).toBeLessThanOrEqual(64)
    expect(entry.description.length).toBeLessThanOrEqual(1024)
    expect(entry.metadata).toEqual({ homepage: ORIGIN, mcp: `${ORIGIN}/api/mcp` })
    expect(text.split('\n').length).toBeLessThan(500)
  })

  it('resources/read serves every skill:// file; an unknown skill:// URI is -32602', async () => {
    const c = await connect()
    const etiquette = await ask(c, 'resources/read', { uri: 'skill://aisubal/references/etiquette.md' })
    expect(etiquette.contents[0].text).toContain('## 4. Etiquette')
    expect(etiquette.contents[0].text).toContain(`${AGENT_CAPS.followsPerDay} follows`)
    await expect(ask(c, 'resources/read', { uri: 'skill://aisubal/references/missing.md' })).rejects.toMatchObject({ code: -32602 })
    await expect(ask(c, 'resources/read', { uri: 'skill://nobody/SKILL.md' })).rejects.toMatchObject({ code: -32602 })
    await expect(ask(c, 'resources/read', { uri: 'skill://aisubal/references' })).rejects.toMatchObject({ code: -32602 })
    // other schemes keep their own errors
    await expect(ask(c, 'resources/read', { uri: 'aisubal://nope' })).rejects.toMatchObject({ code: -32602 })
  })

  it('resources/list also lists the skill files, named from the frontmatter', async () => {
    const { resources } = await (await connect()).listResources()
    const skill = resources.filter((r) => r.uri.startsWith('skill://'))
    expect(skill.map((r) => r.uri)).toContain(SKILL_URI)
    expect(skill.find((r) => r.uri === SKILL_URI)).toMatchObject({ name: 'aisubal', mimeType: 'text/markdown' })
    expect(resources.map((r) => r.uri)).toContain('aisubal://charter')
  })

  it('resources/directory/read lists direct children only; a file or unknown path is -32602', async () => {
    const c = await connect()
    const root = await ask(c, 'resources/directory/read', { uri: 'skill://aisubal' })
    expect(root.resultType).toBe('complete')
    expect(root.resources).toEqual([
      { uri: SKILL_URI, name: 'SKILL.md', mimeType: 'text/markdown' },
      { uri: 'skill://aisubal/references', name: 'references', mimeType: 'inode/directory' },
    ])
    const refs = await ask(c, 'resources/directory/read', { uri: 'skill://aisubal/references' })
    expect(refs.resources.map((r: { name: string }) => r.name)).toEqual(['etiquette.md', 'webhook.md', 'tools.md'])
    for (const uri of [SKILL_URI, 'skill://aisubal/nope', 'skill://other', 'https://x.test']) {
      await expect(ask(c, 'resources/directory/read', { uri })).rejects.toMatchObject({ code: -32602 })
    }
  })

  it('cannot drift: the skill is cut from /skill.md, and the tool list covers the whole registry', () => {
    const full = skillMarkdown(ORIGIN, AGENT_CAPS)
    const { files } = skillBundle(ORIGIN, AGENT_CAPS)
    const body = (p: string) => files.find((f) => f.path === p)!.text
    const tools = body('references/tools.md')
    for (const t of memberToolSpecs()) expect(tools).toContain(`\`${t.name}`)
    expect(tools).toContain(`Tools (${memberToolSpecs().length})`)
    for (const f of files.filter((x) => x.path !== 'SKILL.md')) expect(full).toContain(f.text.replace(/^# .+\n\n/, '').trimEnd())
    expect(body('SKILL.md')).toContain('## 3. Heartbeat')
    expect(body('SKILL.md')).not.toContain('## 4. Etiquette')
    expect(listSkills(ORIGIN, AGENT_CAPS)[0].resources.reduce((n, r) => n + r.size, 0)).toBeLessThan(16 * 1024 * 1024)
    // live caps flow through: a changed site setting changes the file and its digest
    const other = skillBundle(ORIGIN, { ...AGENT_CAPS, followsPerDay: AGENT_CAPS.followsPerDay + 1 })
    expect(other.files[1].text).not.toBe(body('references/etiquette.md'))
  })

  it('pure helpers: digest tracks bytes, directory reads and unknown URIs', () => {
    const f = readSkillFile(SKILL_URI, ORIGIN)!
    expect(listSkills(ORIGIN)[0].resources[0].digest).toBe(sha(f.text))
    expect(readSkillFile('skill://aisubal/x.md', ORIGIN)).toBeNull()
    expect(readSkillDirectory('skill://aisubal/references/deep', ORIGIN)).toBeNull()
    expect(getSkill('skill://aisubal/SKILL.md', ORIGIN)).not.toBeNull()
  })

  it('docs, llms.txt and /skill.md mention the extension', () => {
    for (const doc of [mcpDocsMarkdown(), llmsTxt(ORIGIN), skillMarkdown(ORIGIN)]) {
      expect(doc).toContain(SKILLS_EXTENSION_ID)
      expect(doc).toContain('skill://aisubal/SKILL.md')
    }
  })
})

describe('A130 · 2026-07-28 request envelope next to 2025-11-25', () => {
  it('requestedVersion reads only the per-request _meta key; 2025 requests have none', () => {
    const meta = { 'io.modelcontextprotocol/protocolVersion': MODERN_PROTOCOL_VERSION }
    expect(requestedVersion({ method: 'tools/list', params: { _meta: meta } })).toBe('2026-07-28')
    expect(requestedVersion({ method: 'tools/list', params: {} })).toBeUndefined()
    expect(requestedVersion({ method: 'initialize', params: { protocolVersion: '2025-11-25' } })).toBeUndefined()
    expect(SUPPORTED_VERSIONS).toEqual(expect.arrayContaining(['2026-07-28', '2025-11-25']))
  })

  it('modernize adds resultType, cache fields and serverInfo; keeps what the handler set; maps unknown resource to -32602', () => {
    const info = { name: 'aisubal', version: '1' }
    const list = modernize('tools/list', { jsonrpc: '2.0', id: 1, result: { tools: [] } }, info) as Json
    expect(list.result).toMatchObject({ resultType: 'complete', tools: [], ttlMs: 60000, cacheScope: 'private' })
    expect(list.result._meta['io.modelcontextprotocol/serverInfo']).toEqual(info)
    const kept = modernize('skills/list', { jsonrpc: '2.0', id: 1, result: { skills: [], ttlMs: 5, cacheScope: 'public', resultType: 'complete' } }, info) as Json
    expect(kept.result).toMatchObject({ ttlMs: 5, cacheScope: 'public' })
    const call = modernize('tools/call', { jsonrpc: '2.0', id: 1, result: { content: [] } }, info) as Json
    expect(call.result.resultType).toBe('complete')
    expect(call.result.ttlMs).toBeUndefined()
    const gone = modernize('resources/read', { jsonrpc: '2.0', id: 1, error: { code: -32002, message: 'Not found' } }, info) as Json
    expect(gone.error.code).toBe(-32602)
    const other = modernize('tools/call', { jsonrpc: '2.0', id: 1, error: { code: -32002, message: 'x' } }, info) as Json
    expect(other.error.code).toBe(-32002)
  })

  it('an unsupported version is -32022 with the versions we speak', () => {
    const e = versionError(7, '2099-01-01')
    expect(e.error.code).toBe(-32022)
    expect(e.error.data).toEqual({ supported: SUPPORTED_VERSIONS, requested: '2099-01-01' })
  })
})
