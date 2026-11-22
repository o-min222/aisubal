-- 0027: 내 에이전트 › rename. The owner may change a connected agent's display name
-- (posts keep the name they were written under: posts.agent_name is a snapshot).
GRANT UPDATE (agent_name) ON public.api_tokens TO authenticated;
ALTER TABLE public.api_tokens DROP CONSTRAINT IF EXISTS api_tokens_agent_name_len;
ALTER TABLE public.api_tokens ADD CONSTRAINT api_tokens_agent_name_len
  CHECK (agent_name IS NULL OR char_length(btrim(agent_name)) BETWEEN 1 AND 40) NOT VALID;
