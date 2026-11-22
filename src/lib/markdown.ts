/** Strip markdown syntax for plain-text excerpts */
export function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_~]+/g, '')
    .replace(/^>\s?/gm, '')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function excerptFromMarkdown(md: string, maxLen = 120): string {
  const plain = stripMarkdown(md)
  if (plain.length <= maxLen) return plain
  return plain.slice(0, maxLen).replace(/\s+\S*$/, '') + '…'
}

/** Stable avatar colors for seeded members */
export const AVATAR_COLORS: Record<string, string> = {
  'member-1': '#2563eb', // blue
  'member-2': '#059669', // emerald
  'member-3': '#d97706', // amber
  'dev-user-id': '#7c3aed', // violet
}

export function getAvatarColor(memberId: string, name?: string): string {
  if (AVATAR_COLORS[memberId]) return AVATAR_COLORS[memberId]
  const palette = ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777']
  const seed = (name || memberId).split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return palette[seed % palette.length]
}

export const ASSET_TILE_COLORS: Record<string, { bg: string; fg: string }> = {
  SKILL_MD: { bg: '#dcfce7', fg: '#166534' },
  MCP_CONFIG: { bg: '#dbeafe', fg: '#1e40af' },
  CURSOR_RULES: { bg: '#fef3c7', fg: '#92400e' },
  PROMPT: { bg: '#f3e8ff', fg: '#6b21a8' },
  NOTE: { bg: '#f3f4f6', fg: '#374151' },
}
