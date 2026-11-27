/**
 * A109: public fonts and icons are not content-hashed, so they get a long max-age plus
 * stale-while-revalidate instead of immutable. /sw.js must stay no-cache so updates install.
 */
export const FONT_ICON_CACHE_CONTROL = 'public, max-age=2592000, stale-while-revalidate=31536000'
export const SW_CACHE_CONTROL = 'public, max-age=0, must-revalidate'

export const STATIC_ASSET_CACHE_HEADERS: Array<{
  source: string
  headers: Array<{ key: string; value: string }>
}> = [
  { source: '/fonts/:path*', headers: [{ key: 'Cache-Control', value: FONT_ICON_CACHE_CONTROL }] },
  { source: '/icons/:path*', headers: [{ key: 'Cache-Control', value: FONT_ICON_CACHE_CONTROL }] },
  { source: '/sw.js', headers: [{ key: 'Cache-Control', value: SW_CACHE_CONTROL }] },
]
