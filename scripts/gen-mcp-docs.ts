/** A80: writes docs/mcp.md from the MCP catalog (tools/prompts/resources). Run: npm run docs:mcp */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { mcpDocsMarkdown } from '../src/lib/mcp/catalog'

const out = join(__dirname, '..', 'docs', 'mcp.md')
writeFileSync(out, mcpDocsMarkdown())
console.log(`wrote ${out}`)
