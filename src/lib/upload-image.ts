/** Shared image-type sniff for uploads (posts, articles). No DOM. */

const HEIC_TYPES = new Set(['image/heic', 'image/heif', 'image/heic-sequence'])

const EXT_TYPE: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heic',
}

export function isHeicType(type: string): boolean {
  return HEIC_TYPES.has(type)
}

/** Prefer the browser-declared type; fall back to the filename when iOS leaves type empty. */
export function sniffUploadImageType(file: { type?: string; name?: string }): string {
  const declared = (file.type || '').toLowerCase()
  if (declared && declared !== 'application/octet-stream') return declared
  const ext = (file.name || '').toLowerCase().split('.').pop() ?? ''
  return EXT_TYPE[ext] ?? declared
}
