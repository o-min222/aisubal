import { MUTABLE_TOOLBOX } from '@/lib/mock-toolbox'
import { parseInstallQueue, type InstallQueueItem } from '@/lib/install-admin'
import type { Snippets } from '@/lib/install-catalog'
import { sb, useMockData as isMock } from './client'

// dev mock: route handlers and pages load separate module copies, so share edits via globalThis
const g = globalThis as unknown as { __aisubalInstallEdits?: Map<string, Snippets> }
const mockEdits = () => (g.__aisubalInstallEdits ??= new Map())

/** Admin: every gallery entry with its install state, unconfirmed first (0059 tools_install_queue). */
export async function listInstallQueue(): Promise<InstallQueueItem[]> {
  if (isMock()) {
    const edits = mockEdits()
    return parseInstallQueue(
      [...MUTABLE_TOOLBOX]
        .map((e) => (edits.has(e.id) ? { ...e, install_snippets: edits.get(e.id)!, install_verified: Object.keys(edits.get(e.id)!).length > 0 } : e))
        .sort((a, b) => Number(Boolean(a.install_verified)) - Number(Boolean(b.install_verified)))
        .map((e) => ({
          id: e.id, slug: e.slug, name: e.name, type: e.type, oneLiner: e.one_liner,
          canonicalUrl: e.canonical_url, homepageUrl: e.homepage_url, githubUrl: e.github_url,
          sourceRepo: e.source_repo, license: e.license, lastCommitAt: e.last_commit_at,
          verified: Boolean(e.install_verified), snippets: e.install_snippets ?? {},
          verifiedAt: e.install_verified ? e.updated_at : null, verifiedBy: e.install_verified ? '관리자' : null,
          installCount: e.install_count, updatedAt: e.updated_at,
        }))
    )
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('tools_install_queue')
  if (error) throw new Error(error.message)
  return parseInstallQueue(data)
}

/** Admin confirms (or with {} withdraws) an entry's install commands. */
export async function confirmInstall(id: string, snippets: Snippets): Promise<{ verified: boolean }> {
  if (isMock()) {
    const e = MUTABLE_TOOLBOX.find((x) => x.id === id)
    if (!e) throw new Error('not_found')
    mockEdits().set(id, snippets)
    return { verified: Object.keys(snippets).length > 0 }
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('tools_confirm_install', { p_entry: id, p_snippets: snippets })
  if (error) throw new Error(error.message)
  return { verified: Boolean((data as { installVerified?: boolean } | null)?.installVerified) }
}
