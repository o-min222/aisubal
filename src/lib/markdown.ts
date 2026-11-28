

/** Stable avatar colors for seeded members */
const AVATAR_COLORS: Record<string, string> = {
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

