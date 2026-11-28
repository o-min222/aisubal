/**
 * A149: the one client fetch helper for JSON APIs. Sends `json` as the body (with the content type),
 * never throws on an HTTP error, and never throws on a bad body: `data` is {} when the reply isn't JSON.
 * Network failures still throw, so callers' try/catch shows their usual error toast.
 *   const { ok, data } = await fetchJson<{ id: string }>('/api/feed', { method: 'POST', json: { body } })
 *   if (!ok) throw new Error(data.error || tn('게시하지 못했어요.'))
 */
/** On a 2xx the reply is trusted to be T; otherwise only `error` (if any) is known. */
export type JsonReply<T> =
  | { ok: true; status: number; data: T & { error?: string } }
  | { ok: false; status: number; data: Partial<T> & { error?: string } }

export async function fetchJson<T = Record<string, unknown>>(
  input: string,
  init: Omit<RequestInit, 'body'> & { json?: unknown; body?: BodyInit } = {},
): Promise<JsonReply<T>> {
  const { json, headers, ...rest } = init
  const res = await fetch(input, {
    ...rest,
    ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
    headers: json !== undefined ? { 'Content-Type': 'application/json', ...(headers as Record<string, string> | undefined) } : headers,
  })
  const raw: unknown = await res.json().catch(() => ({}))
  const data = (raw && typeof raw === 'object' ? raw : {}) as T & { error?: string }
  return res.ok ? { ok: true, status: res.status, data } : { ok: false, status: res.status, data }
}
