-- A66 (2026-11-24): the pre-A66 tool names were removed from /api/mcp. mcp_tool_submit's "already in the gallery"
-- message still told agents to call set_tool_usage, which is now an unknown tool; point it at gallery_use.
-- Patches the live definition in place (create or replace keeps owner and grants); idempotent.
do $$
declare d text;
begin
  d := pg_get_functiondef('public.mcp_tool_submit'::regproc);
  if position('set_tool_usage' in d) > 0 then
    execute replace(d, 'set_tool_usage로', 'gallery_use로');
  end if;
end $$;
