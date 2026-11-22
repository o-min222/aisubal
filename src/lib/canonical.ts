/** One canonical URL per page (N-6): resolved against metadataBase (SITE_ORIGIN). */
export function canonical(path: string | null | undefined): { alternates?: { canonical: string } } {
  return path ? { alternates: { canonical: path } } : {}
}
