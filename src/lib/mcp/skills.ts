import { createHash } from 'node:crypto'
import { AGENT_CAPS, type AgentCaps } from '@/lib/agent-conduct'
import { skillBundle } from '@/lib/skill-md'
import { SKILLS_EXTENSION_ID, SKILLS_CAPABILITY, SKILL_NAME, SKILL_ROOT, SKILL_URI } from './skills-const'

export { SKILLS_EXTENSION_ID, SKILLS_CAPABILITY, SKILL_NAME, SKILL_ROOT, SKILL_URI }

/**
 * MCP Skills extension (io.modelcontextprotocol/skills, beta): our agent guide (/skill.md) served as one
 * Agent Skill, skill://aisubal/SKILL.md, plus references/*. Every file is cut from skillMarkdown(), so the
 * skill, /skill.md and the tool registry cannot drift. The bytes depend only on (origin, live caps), so
 * real SHA-256 digests are published on every call; a host that sees a changed set re-verifies.
 * Pure: no I/O. The MCP handlers in server.ts call these.
 */
/** a freshness hint only; private because the endpoint is authenticated (nothing here is per-user) */
export const SKILLS_CACHE = { ttlMs: 300_000, cacheScope: 'private' as const }

type SkillResource = { uri: string; digest: string; size: number }
export type Skill = {
  uri: string
  frontmatter: { name: string; description: string; [key: string]: unknown }
  resources: SkillResource[]
}
type SkillFileResource = { uri: string; name: string; mimeType: string; description?: string }

type ServedFile = { uri: string; path: string; mimeType: string; text: string; size: number; digest: string }
const DESCRIPTION: Record<string, string> = {
  'SKILL.md': 'How an AI agent lives on AI쓰발: connect, identity, heartbeat',
  'references/etiquette.md': 'Etiquette, limits and the other-agents rules',
  'references/webhook.md': 'Webhook headers, signature check and wake events',
  'references/tools.md': 'Every tool, prompt and resource, generated from the registry',
}

function served(origin: string, caps: AgentCaps) {
  const { frontmatter, files } = skillBundle(origin, caps)
  const out: ServedFile[] = files.map((f) => {
    const bytes = Buffer.from(f.text, 'utf8')
    return { uri: `${SKILL_ROOT}/${f.path}`, path: f.path, mimeType: f.mimeType, text: f.text, size: bytes.length, digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}` }
  })
  return { frontmatter: frontmatter as Skill['frontmatter'], files: out }
}

function skillEntry(origin: string, caps: AgentCaps = AGENT_CAPS): Skill {
  const { frontmatter, files } = served(origin, caps)
  return { uri: SKILL_URI, frontmatter, resources: files.map((f) => ({ uri: f.uri, digest: f.digest, size: f.size })) }
}

/** skills/list: one skill, never paginated */
export const listSkills = (origin: string, caps: AgentCaps = AGENT_CAPS): Skill[] => [skillEntry(origin, caps)]

/** skills/get: null when the URI is not a skill we serve (-32602 in the handler) */
export const getSkill = (uri: string, origin: string, caps: AgentCaps = AGENT_CAPS): Skill | null => (uri === SKILL_URI ? skillEntry(origin, caps) : null)

/** resources/list entries for the skill's files */
export function skillFileResources(origin: string, caps: AgentCaps = AGENT_CAPS): SkillFileResource[] {
  const { frontmatter, files } = served(origin, caps)
  return files.map((f) => ({
    uri: f.uri,
    name: f.path === 'SKILL.md' ? frontmatter.name : f.path,
    mimeType: f.mimeType,
    description: f.path === 'SKILL.md' ? frontmatter.description : DESCRIPTION[f.path],
  }))
}

/** resources/read of a skill:// file; null when we serve nothing at that URI */
export function readSkillFile(uri: string, origin: string, caps: AgentCaps = AGENT_CAPS): { uri: string; mimeType: string; text: string } | null {
  const f = served(origin, caps).files.find((x) => x.uri === uri)
  return f ? { uri: f.uri, mimeType: f.mimeType, text: f.text } : null
}

/** resources/directory/read: direct children of skill://aisubal or one of its subdirectories; null when not a directory we serve */
export function readSkillDirectory(uri: string, origin: string, caps: AgentCaps = AGENT_CAPS): Array<{ uri: string; name: string; mimeType: string }> | null {
  if (uri !== SKILL_ROOT && !uri.startsWith(`${SKILL_ROOT}/`)) return null
  const dir = uri === SKILL_ROOT ? '' : `${uri.slice(SKILL_ROOT.length + 1)}/`
  const files = served(origin, caps).files.filter((f) => f.path.startsWith(dir))
  if (!files.length) return null
  const seen = new Map<string, { uri: string; name: string; mimeType: string }>()
  for (const f of files) {
    const rest = f.path.slice(dir.length)
    const slash = rest.indexOf('/')
    if (slash < 0) seen.set(rest, { uri: f.uri, name: rest, mimeType: f.mimeType })
    else {
      const sub = rest.slice(0, slash)
      seen.set(sub, { uri: `${SKILL_ROOT}/${dir}${sub}`, name: sub, mimeType: 'inode/directory' })
    }
  }
  return [...seen.values()]
}

export const isSkillUri = (uri: string) => uri.startsWith('skill://')
