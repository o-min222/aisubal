-- 0030: connect-wizard clients 'grok_bot' (remote MCP by URL + bearer token) and 'chatgpt_desktop'.
ALTER TABLE public.api_tokens DROP CONSTRAINT IF EXISTS api_tokens_client_chk;
ALTER TABLE public.api_tokens ADD CONSTRAINT api_tokens_client_chk
  CHECK (client IS NULL OR client IN ('claude_desktop','claude_code','chatgpt','cursor','chatgpt_desktop','codex','grok_bot','custom'));
