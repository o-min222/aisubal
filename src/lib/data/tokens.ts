import { createHash, randomBytes } from 'crypto'
import type { ApiToken, TokenScope } from '@/lib/supabase/types'
import { sb, useMockData } from './client'

export type PublicToken = {
  id: string
  name: string
  scopes: string[]
  tokenPrefix: string
  createdAt: string
  lastUsedAt: string | null
  expiresAt: string | null
}

function hashToken(raw: string) {
  return createHash('sha256').update(raw).digest('hex')
}

function parseScopes(scopes: string): string[] {
  return scopes
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export async function listApiTokens(memberId: string): Promise<PublicToken[]> {
  if (useMockData()) {
    return [
      {
        id: 'token-1',
        name: '개인 맥북',
        scopes: ['archive_read', 'archive_write', 'posts_read'],
        tokenPrefix: 'aisubal_',
        createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
        lastUsedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        expiresAt: null,
      },
      {
        id: 'token-2',
        name: 'CLI 테스트',
        scopes: ['archive_read'],
        tokenPrefix: 'aisubal_',
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        lastUsedAt: null,
        expiresAt: null,
      },
    ]
  }

  const supabase = await sb()
  const { data, error } = await supabase
    .from('api_tokens')
    .select('id, name, scopes, token_prefix, created_at, last_used_at, expires_at, is_revoked')
    .eq('member_id', memberId)
    .eq('is_revoked', false)
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data || []).map((t) => ({
    id: t.id,
    name: t.name,
    scopes: parseScopes(t.scopes),
    tokenPrefix: t.token_prefix,
    createdAt: t.created_at,
    lastUsedAt: t.last_used_at,
    expiresAt: t.expires_at,
  }))
}

export async function issueApiToken(
  memberId: string,
  name: string,
  scopes: TokenScope[]
): Promise<{ token: PublicToken & { token: string } }> {
  const raw = `aisubal_${randomBytes(24).toString('hex')}`
  const tokenHash = hashToken(raw)
  const tokenPrefix = raw.slice(0, 12)

  if (useMockData()) {
    return {
      token: {
        id: `token-${Date.now()}`,
        name,
        scopes,
        tokenPrefix,
        token: raw,
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
        expiresAt: null,
      },
    }
  }

  const supabase = await sb()
  const { data, error } = await supabase
    .from('api_tokens')
    .insert({
      member_id: memberId,
      name,
      token_hash: tokenHash,
      token_prefix: tokenPrefix,
      scopes: scopes.join(','),
    })
    .select('id, name, scopes, token_prefix, created_at, last_used_at, expires_at')
    .single()

  if (error) throw error

  return {
    token: {
      id: data.id,
      name: data.name,
      scopes: parseScopes(data.scopes),
      tokenPrefix: data.token_prefix,
      token: raw,
      createdAt: data.created_at,
      lastUsedAt: data.last_used_at,
      expiresAt: data.expires_at,
    },
  }
}

export async function revokeApiToken(memberId: string, tokenId: string): Promise<boolean> {
  if (useMockData()) return true

  const supabase = await sb()
  const { data, error } = await supabase
    .from('api_tokens')
    .update({ is_revoked: true })
    .eq('id', tokenId)
    .eq('member_id', memberId)
    .eq('is_revoked', false)
    .select('id')
    .maybeSingle()

  if (error) throw error
  return !!data
}

/** Lookup by raw bearer token (hashed). Used by MCP/CLI auth. */
export async function findTokenByRaw(
  raw: string
): Promise<(ApiToken & { member_id: string }) | null> {
  if (useMockData()) return null
  const supabase = await sb()
  const { data, error } = await supabase
    .from('api_tokens')
    .select('*')
    .eq('token_hash', hashToken(raw))
    .eq('is_revoked', false)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  if (data.expires_at && new Date(data.expires_at) < new Date()) return null
  await supabase
    .from('api_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)
  return data as ApiToken & { member_id: string }
}
