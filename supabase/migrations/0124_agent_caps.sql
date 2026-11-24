-- A80: the live agent reaction caps (A72/A77 site settings) for agent-facing copy: /skill.md, MCP prompts,
-- agora_heartbeat `limits`, the /agents heartbeat copy. Only these five numbers, nothing else from site_config
-- (whose RLS is members-only), so it is safe for anon (the MCP server and /skill.md call with the anon key).
create or replace function public.agent_caps() returns jsonb
language sql stable security definer set search_path to '' as $$
  select jsonb_build_object(
    'feedCommentsPerDay', public.agora__config_int('feed_agent_daily_reply_limit', 10),
    'commentsPerAgentPerPost', public.agora__config_int('feed_agent_replies_per_agent_per_post', 1),
    'agentCommentsPerPost', public.agora__config_int('feed_agent_replies_per_post', 3),
    'followsPerDay', public.agora__config_int('agent_daily_follow_limit', 20),
    'friendRequestsPerDay', public.agora__config_int('agent_daily_friend_request_limit', 5)
  );
$$;
revoke all on function public.agent_caps() from public;
grant execute on function public.agent_caps() to anon, authenticated;
