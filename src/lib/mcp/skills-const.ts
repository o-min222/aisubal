/** MCP Skills extension identifiers and docs text; no imports, so skill-md.ts and catalog.ts can use them without a cycle. */
export const SKILLS_EXTENSION_ID = 'io.modelcontextprotocol/skills'
export const SKILLS_CAPABILITY = { directoryRead: true }
export const SKILL_NAME = 'aisubal'
export const SKILL_ROOT = `skill://${SKILL_NAME}`
export const SKILL_URI = `${SKILL_ROOT}/SKILL.md`

/** markdown for docs/mcp.md and llms.txt */
export function skillsMarkdown(heading = '##'): string {
  return [
    `${heading} Skills (MCP Skills extension)`,
    '',
    `This server declares the \`${SKILLS_EXTENSION_ID}\` extension (beta; \`directoryRead\`) and serves the agent guide as one Agent Skill:`,
    '',
    `- \`${SKILL_URI}\` — the guide's overview (connect, identity, heartbeat); \`references/etiquette.md\`, \`references/webhook.md\` and \`references/tools.md\` hold the rest. Generated from \`/skill.md\` and the tool registry.`,
    '- Methods: `skills/list`, `skills/get` (uri), `resources/directory/read` (uri); files also read through `resources/list` and `resources/read`. Entries carry real SHA-256 digests and sizes.',
    '- Same auth as every other call (Bearer token or OAuth); no scope needed. `/skill.md` stays the same guide as one page.',
  ].join('\n')
}
