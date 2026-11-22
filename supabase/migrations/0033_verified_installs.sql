-- 0033 — Gallery install commands: verified only (QA B-1 security), real numbers only (B-3),
-- category/description fixes (B-4).
--  * Commands used to be generated from slugs ('/' → '-'): `npm i -g @anthropics-claude-code`,
--    `npx -y @upstash-context7`… packages that don't exist and could be typosquatted. The app no
--    longer generates anything; every command below was checked against npm/PyPI and the
--    project's official README. Entries without one show only the official install link.
--  * install_verified: commands render only when TRUE. A trigger forces it FALSE on any insert or
--    snippet change unless the write runs inside tools_confirm_install (admin) — so an approved
--    submission (or any other path) can never render unreviewed commands.

ALTER TABLE public.toolbox_entries ADD COLUMN IF NOT EXISTS install_verified BOOLEAN NOT NULL DEFAULT FALSE;

CREATE OR REPLACE FUNCTION public.toolbox_entries_install_guard()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF COALESCE(current_setting('app.install_verified', TRUE), '') = 'on' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.install_verified := FALSE;
  ELSIF NEW.install_snippets IS DISTINCT FROM OLD.install_snippets THEN
    NEW.install_verified := FALSE;
  ELSE
    NEW.install_verified := OLD.install_verified;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS toolbox_entries_install_guard_trg ON public.toolbox_entries;
CREATE TRIGGER toolbox_entries_install_guard_trg BEFORE INSERT OR UPDATE ON public.toolbox_entries
  FOR EACH ROW EXECUTE FUNCTION public.toolbox_entries_install_guard();

-- Admin confirms (or clears, p_snippets = {}) the install commands of one entry.
CREATE OR REPLACE FUNCTION public.tools_confirm_install(p_entry UUID, p_snippets JSONB)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE k TEXT; v JSONB; e public.toolbox_entries%ROWTYPE;
BEGIN
  IF NOT COALESCE(public.app__is_admin(), FALSE) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF jsonb_typeof(p_snippets) <> 'object' OR octet_length(p_snippets::text) > 20000 THEN RAISE EXCEPTION 'install_invalid' USING ERRCODE = 'P0001'; END IF;
  FOR k, v IN SELECT * FROM jsonb_each(p_snippets) LOOP
    IF k NOT IN ('generic', 'claude_code', 'claude_desktop', 'cursor', 'codex_cli', 'gemini_cli', 'chatgpt')
       OR jsonb_typeof(v) <> 'string' OR char_length(v #>> '{}') > 4000 THEN
      RAISE EXCEPTION 'install_invalid' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
  PERFORM set_config('app.install_verified', 'on', TRUE);
  UPDATE public.toolbox_entries SET install_snippets = p_snippets, install_verified = (p_snippets <> '{}'::jsonb), updated_at = NOW()
   WHERE id = p_entry RETURNING * INTO e;
  PERFORM set_config('app.install_verified', '', TRUE);
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  RETURN jsonb_build_object('id', e.id, 'slug', e.slug, 'installVerified', e.install_verified);
END;
$$;
REVOKE ALL ON FUNCTION public.tools_confirm_install(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tools_confirm_install(UUID, JSONB) TO authenticated;

-- ---- data ----
-- 1) every existing generated command is untrusted: clear all, then set the verified ones
SELECT set_config('app.install_verified', 'on', TRUE);
UPDATE public.toolbox_entries SET install_snippets = '{}'::jsonb, install_verified = FALSE;
UPDATE public.toolbox_entries SET install_snippets = '{"claude_code":"claude mcp add brave-search -e BRAVE_API_KEY=<BRAVE_API_KEY> -- npx -y @brave/brave-search-mcp-server --transport stdio","cursor":"// ~/.cursor/mcp.json\n{\n  \"mcpServers\": {\n    \"brave-search\": {\n      \"command\": \"npx\",\n      \"args\": [\"-y\", \"@brave/brave-search-mcp-server\", \"--transport\", \"stdio\"],\n      \"env\": { \"BRAVE_API_KEY\": \"<BRAVE_API_KEY>\" }\n    }\n  }\n}","claude_desktop":"// claude_desktop_config.json\n{\n  \"mcpServers\": {\n    \"brave-search\": {\n      \"command\": \"npx\",\n      \"args\": [\"-y\", \"@brave/brave-search-mcp-server\", \"--transport\", \"stdio\"],\n      \"env\": { \"BRAVE_API_KEY\": \"<BRAVE_API_KEY>\" }\n    }\n  }\n}","codex_cli":"# ~/.codex/config.toml\n[mcp_servers.brave_search]\ncommand = \"npx\"\nargs = [\"-y\", \"@brave/brave-search-mcp-server\", \"--transport\", \"stdio\"]\nenv = { BRAVE_API_KEY = \"<BRAVE_API_KEY>\" }","gemini_cli":"// ~/.gemini/settings.json\n{\n  \"mcpServers\": {\n    \"brave-search\": {\n      \"command\": \"npx\",\n      \"args\": [\"-y\", \"@brave/brave-search-mcp-server\", \"--transport\", \"stdio\"],\n      \"env\": { \"BRAVE_API_KEY\": \"<BRAVE_API_KEY>\" }\n    }\n  }\n}","generic":"{\n  \"mcpServers\": {\n    \"brave-search\": {\n      \"command\": \"npx\",\n      \"args\": [\"-y\", \"@brave/brave-search-mcp-server\", \"--transport\", \"stdio\"],\n      \"env\": { \"BRAVE_API_KEY\": \"<BRAVE_API_KEY>\" }\n    }\n  }\n}"}'::jsonb, install_verified = true, homepage_url = COALESCE(homepage_url, 'https://github.com/brave/brave-search-mcp-server#readme') WHERE slug = 'brave-search-mcp';
UPDATE public.toolbox_entries SET install_snippets = '{"claude_code":"claude mcp add --transport http browserbase https://mcp.browserbase.com/mcp","cursor":"// ~/.cursor/mcp.json\n{\n  \"mcpServers\": {\n    \"browserbase\": { \"url\": \"https://mcp.browserbase.com/mcp\" }\n  }\n}","claude_desktop":"// Claude 데스크톱 → 설정 → 커넥터 → 커스텀 커넥터 추가\nhttps://mcp.browserbase.com/mcp","generic":"https://mcp.browserbase.com/mcp"}'::jsonb, install_verified = true, homepage_url = COALESCE(homepage_url, 'https://github.com/browserbase/mcp-server-browserbase#readme') WHERE slug = 'browserbase-mcp';
UPDATE public.toolbox_entries SET install_snippets = '{"claude_code":"claude mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest","cursor":"// ~/.cursor/mcp.json\n{\n  \"mcpServers\": {\n    \"chrome-devtools\": {\n      \"command\": \"npx\",\n      \"args\": [\"-y\", \"chrome-devtools-mcp@latest\"]\n    }\n  }\n}","claude_desktop":"// claude_desktop_config.json\n{\n  \"mcpServers\": {\n    \"chrome-devtools\": {\n      \"command\": \"npx\",\n      \"args\": [\"-y\", \"chrome-devtools-mcp@latest\"]\n    }\n  }\n}","codex_cli":"# ~/.codex/config.toml\n[mcp_servers.chrome_devtools]\ncommand = \"npx\"\nargs = [\"-y\", \"chrome-devtools-mcp@latest\"]","gemini_cli":"// ~/.gemini/settings.json\n{\n  \"mcpServers\": {\n    \"chrome-devtools\": {\n      \"command\": \"npx\",\n      \"args\": [\"-y\", \"chrome-devtools-mcp@latest\"]\n    }\n  }\n}","generic":"{\n  \"mcpServers\": {\n    \"chrome-devtools\": {\n      \"command\": \"npx\",\n      \"args\": [\"-y\", \"chrome-devtools-mcp@latest\"]\n    }\n  }\n}"}'::jsonb, install_verified = true, homepage_url = COALESCE(homepage_url, 'https://github.com/ChromeDevTools/chrome-devtools-mcp#readme') WHERE slug = 'chrome-devtools-mcp';
UPDATE public.toolbox_entries SET install_snippets = '{"claude_code":"claude mcp add --transport http context7 https://mcp.context7.com/mcp","cursor":"// ~/.cursor/mcp.json\n{\n  \"mcpServers\": {\n    \"context7\": { \"url\": \"https://mcp.context7.com/mcp\" }\n  }\n}","claude_desktop":"// Claude 데스크톱 → 설정 → 커넥터 → 커스텀 커넥터 추가\nhttps://mcp.context7.com/mcp","generic":"https://mcp.context7.com/mcp"}'::jsonb, install_verified = true, homepage_url = COALESCE(homepage_url, 'https://github.com/upstash/context7#readme') WHERE slug = 'context7';
UPDATE public.toolbox_entries SET install_snippets = '{"claude_code":"claude mcp add --transport http exa https://mcp.exa.ai/mcp","cursor":"// ~/.cursor/mcp.json\n{\n  \"mcpServers\": {\n    \"exa\": { \"url\": \"https://mcp.exa.ai/mcp\" }\n  }\n}","claude_desktop":"// Claude 데스크톱 → 설정 → 커넥터 → 커스텀 커넥터 추가\nhttps://mcp.exa.ai/mcp","generic":"https://mcp.exa.ai/mcp"}'::jsonb, install_verified = true, homepage_url = COALESCE(homepage_url, 'https://github.com/exa-labs/exa-mcp-server#readme') WHERE slug = 'exa-mcp';
UPDATE public.toolbox_entries SET install_snippets = '{"claude_code":"claude mcp add firecrawl -e FIRECRAWL_API_KEY=<FIRECRAWL_API_KEY> -- npx -y firecrawl-mcp","cursor":"// ~/.cursor/mcp.json\n{\n  \"mcpServers\": {\n    \"firecrawl\": {\n      \"command\": \"npx\",\n      \"args\": [\"-y\", \"firecrawl-mcp\"],\n      \"env\": { \"FIRECRAWL_API_KEY\": \"<FIRECRAWL_API_KEY>\" }\n    }\n  }\n}","claude_desktop":"// claude_desktop_config.json\n{\n  \"mcpServers\": {\n    \"firecrawl\": {\n      \"command\": \"npx\",\n      \"args\": [\"-y\", \"firecrawl-mcp\"],\n      \"env\": { \"FIRECRAWL_API_KEY\": \"<FIRECRAWL_API_KEY>\" }\n    }\n  }\n}","codex_cli":"# ~/.codex/config.toml\n[mcp_servers.firecrawl]\ncommand = \"npx\"\nargs = [\"-y\", \"firecrawl-mcp\"]\nenv = { FIRECRAWL_API_KEY = \"<FIRECRAWL_API_KEY>\" }","gemini_cli":"// ~/.gemini/settings.json\n{\n  \"mcpServers\": {\n    \"firecrawl\": {\n      \"command\": \"npx\",\n      \"args\": [\"-y\", \"firecrawl-mcp\"],\n      \"env\": { \"FIRECRAWL_API_KEY\": \"<FIRECRAWL_API_KEY>\" }\n    }\n  }\n}","generic":"{\n  \"mcpServers\": {\n    \"firecrawl\": {\n      \"command\": \"npx\",\n      \"args\": [\"-y\", \"firecrawl-mcp\"],\n      \"env\": { \"FIRECRAWL_API_KEY\": \"<FIRECRAWL_API_KEY>\" }\n    }\n  }\n}"}'::jsonb, install_verified = true, homepage_url = COALESCE(homepage_url, 'https://github.com/firecrawl/firecrawl-mcp-server#readme') WHERE slug = 'firecrawl-mcp';
UPDATE public.toolbox_entries SET install_snippets = '{"claude_code":"claude mcp add --transport http github https://api.githubcopilot.com/mcp/","cursor":"// ~/.cursor/mcp.json\n{\n  \"mcpServers\": {\n    \"github\": { \"url\": \"https://api.githubcopilot.com/mcp/\" }\n  }\n}","claude_desktop":"// Claude 데스크톱 → 설정 → 커넥터 → 커스텀 커넥터 추가\nhttps://api.githubcopilot.com/mcp/","generic":"# GitHub OAuth 또는 PAT 인증이 필요해요 (공식 문서 참고)\nhttps://api.githubcopilot.com/mcp/"}'::jsonb, install_verified = true, homepage_url = COALESCE(homepage_url, 'https://github.com/github/github-mcp-server#readme') WHERE slug = 'github-mcp-server';
UPDATE public.toolbox_entries SET install_snippets = '{"claude_code":"claude mcp add playwright -- npx -y @playwright/mcp@latest","cursor":"// ~/.cursor/mcp.json\n{\n  \"mcpServers\": {\n    \"playwright\": {\n      \"command\": \"npx\",\n      \"args\": [\"-y\", \"@playwright/mcp@latest\"]\n    }\n  }\n}","claude_desktop":"// claude_desktop_config.json\n{\n  \"mcpServers\": {\n    \"playwright\": {\n      \"command\": \"npx\",\n      \"args\": [\"-y\", \"@playwright/mcp@latest\"]\n    }\n  }\n}","codex_cli":"# ~/.codex/config.toml\n[mcp_servers.playwright]\ncommand = \"npx\"\nargs = [\"-y\", \"@playwright/mcp@latest\"]","gemini_cli":"// ~/.gemini/settings.json\n{\n  \"mcpServers\": {\n    \"playwright\": {\n      \"command\": \"npx\",\n      \"args\": [\"-y\", \"@playwright/mcp@latest\"]\n    }\n  }\n}","generic":"{\n  \"mcpServers\": {\n    \"playwright\": {\n      \"command\": \"npx\",\n      \"args\": [\"-y\", \"@playwright/mcp@latest\"]\n    }\n  }\n}"}'::jsonb, install_verified = true, homepage_url = COALESCE(homepage_url, 'https://github.com/microsoft/playwright-mcp#readme') WHERE slug = 'playwright-mcp';
UPDATE public.toolbox_entries SET install_snippets = '{"claude_code":"claude mcp add --transport http supabase https://mcp.supabase.com/mcp","cursor":"// ~/.cursor/mcp.json\n{\n  \"mcpServers\": {\n    \"supabase\": { \"url\": \"https://mcp.supabase.com/mcp\" }\n  }\n}","claude_desktop":"// Claude 데스크톱 → 설정 → 커넥터 → 커스텀 커넥터 추가\nhttps://mcp.supabase.com/mcp","generic":"https://mcp.supabase.com/mcp"}'::jsonb, install_verified = true, homepage_url = COALESCE(homepage_url, 'https://supabase.com/docs/guides/getting-started/mcp') WHERE slug = 'supabase-mcp';
UPDATE public.toolbox_entries SET install_snippets = '{}'::jsonb, install_verified = false, homepage_url = COALESCE(homepage_url, 'https://github.com/modelcontextprotocol/servers#readme') WHERE slug = 'mcp-servers-reference';
UPDATE public.toolbox_entries SET install_snippets = '{}'::jsonb, install_verified = false, homepage_url = COALESCE(homepage_url, 'https://github.com/punkpeye/awesome-mcp-servers#readme') WHERE slug = 'awesome-mcp-servers';
UPDATE public.toolbox_entries SET install_snippets = '{"generic":"# 서버\nnpm install @modelcontextprotocol/server\n# 클라이언트\nnpm install @modelcontextprotocol/client"}'::jsonb, install_verified = true, homepage_url = COALESCE(homepage_url, 'https://github.com/modelcontextprotocol/typescript-sdk#readme') WHERE slug = 'mcp-typescript-sdk';
UPDATE public.toolbox_entries SET install_snippets = '{"generic":"python -m pip install aider-install\naider-install"}'::jsonb, install_verified = true, homepage_url = COALESCE(homepage_url, 'https://aider.chat/docs/install.html') WHERE slug = 'aider';
UPDATE public.toolbox_entries SET install_snippets = '{"generic":"curl -fsSL https://claude.ai/install.sh | bash\n# 또는\nnpm install -g @anthropic-ai/claude-code"}'::jsonb, install_verified = true, homepage_url = COALESCE(homepage_url, 'https://docs.anthropic.com/en/docs/claude-code/setup') WHERE slug = 'claude-code';
UPDATE public.toolbox_entries SET install_snippets = '{"generic":"npm install -g @google/gemini-cli\n# 또는\nbrew install gemini-cli"}'::jsonb, install_verified = true, homepage_url = COALESCE(homepage_url, 'https://github.com/google-gemini/gemini-cli#readme') WHERE slug = 'gemini-cli';
UPDATE public.toolbox_entries SET install_snippets = '{"generic":"npm install -g @openai/codex\n# 또는\nbrew install --cask codex"}'::jsonb, install_verified = true, homepage_url = COALESCE(homepage_url, 'https://github.com/openai/codex#readme') WHERE slug = 'openai-codex';
UPDATE public.toolbox_entries SET install_snippets = '{"generic":"# macOS · Windows: https://ollama.com/download 에서 앱 설치\n# Linux\ncurl -fsSL https://ollama.com/install.sh | sh"}'::jsonb, install_verified = true, homepage_url = COALESCE(homepage_url, 'https://ollama.com/download') WHERE slug = 'ollama';
UPDATE public.toolbox_entries SET install_snippets = '{"generic":"pip install dspy"}'::jsonb, install_verified = true, homepage_url = COALESCE(homepage_url, 'https://dspy.ai') WHERE slug = 'dspy';
UPDATE public.toolbox_entries SET install_snippets = '{"generic":"npx create-next-app@latest"}'::jsonb, install_verified = true, homepage_url = COALESCE(homepage_url, 'https://nextjs.org/docs/app/getting-started/installation') WHERE slug = 'vercel-next.js';
UPDATE public.toolbox_entries SET install_snippets = '{"claude_code":"/plugin marketplace add anthropics/skills\n/plugin install document-skills@anthropic-agent-skills"}'::jsonb, install_verified = true, homepage_url = COALESCE(homepage_url, 'https://github.com/anthropics/skills#readme') WHERE slug = 'anthropic-skills';
UPDATE public.toolbox_entries SET install_snippets = '{}'::jsonb, install_verified = false, homepage_url = COALESCE(homepage_url, 'https://github.com/anthropics/courses#readme') WHERE slug = 'anthropic-courses';
UPDATE public.toolbox_entries SET install_snippets = '{"generic":"npm install ai"}'::jsonb, install_verified = true, homepage_url = COALESCE(homepage_url, 'https://ai-sdk.dev/docs/getting-started') WHERE slug = 'vercel-ai-sdk';
UPDATE public.toolbox_entries SET install_snippets = '{}'::jsonb, install_verified = false, homepage_url = COALESCE(homepage_url, 'https://docs.continue.dev') WHERE slug = 'continue';

-- 2) B-3: no seeded numbers — ratings/mentions from real member data, installs count from now
UPDATE public.toolbox_entries e SET
  avg_rating = COALESCE((SELECT round(avg(r.rating)::numeric, 1) FROM public.toolbox_reviews r WHERE r.entry_id = e.id), 0),
  rating_count = (SELECT count(*) FROM public.toolbox_reviews r WHERE r.entry_id = e.id),
  mention_count = (SELECT count(*) FROM public.toolbox_mentions m WHERE m.entry_id = e.id),
  install_count = 0;

-- 3) B-4: categories + descriptions (MCP / 스킬 / CLI / 서비스)
UPDATE public.toolbox_entries SET name = 'Next.js', type = 'cli_tool',
  one_liner = 'Vercel의 풀스택 React 프레임워크 — create-next-app으로 바로 시작',
  description = 'Vercel이 만드는 React 프레임워크. App Router·서버 컴포넌트·스트리밍을 기본으로 지원하고, create-next-app으로 새 프로젝트를 바로 만들 수 있어요.',
  tags = ARRAY['react', '프레임워크', 'vercel']
 WHERE slug = 'vercel-next.js';
UPDATE public.toolbox_entries SET type = 'mcp_server',
  description = 'punkpeye/awesome-mcp-servers — 커뮤니티가 모은 MCP 서버 목록. 설치용이 아니라 찾아보기용 인덱스예요.'
 WHERE slug = 'awesome-mcp-servers';
UPDATE public.toolbox_entries SET type = 'mcp_server',
  one_liner = 'MCP 서버·클라이언트를 TypeScript로 만드는 공식 SDK',
  description = 'modelcontextprotocol/typescript-sdk — MCP 서버와 클라이언트를 TypeScript로 구현하는 공식 SDK. 서버용 @modelcontextprotocol/server, 클라이언트용 @modelcontextprotocol/client 패키지로 나뉘어 있어요.'
 WHERE slug = 'mcp-typescript-sdk';
UPDATE public.toolbox_entries SET description = 'stanfordnlp/dspy — 프롬프트를 손으로 고치는 대신 프로그램으로 쓰고 최적화하는 Python 프레임워크.'
 WHERE slug = 'dspy' AND description = 'stanfordnlp/dspy';
SELECT set_config('app.install_verified', '', TRUE);
