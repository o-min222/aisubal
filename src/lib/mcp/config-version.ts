/** Server/config version stamped on each MCP call. Bump when install config or protocol needs a reconnect. Must match public.mcp_config_version(). */
export const MCP_CONFIG_VERSION = '2026-11-28.2'

/** Connected agents whose last call saw an older server/config version. Never-connected agents are not "behind". */
export function mcpConfigBehind(opts: { version?: string | null; lastUsedAt?: string | null }): boolean {
  return Boolean(opts.lastUsedAt) && opts.version !== MCP_CONFIG_VERSION
}
