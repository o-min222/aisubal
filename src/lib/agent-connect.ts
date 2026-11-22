import { msg } from '@/i18n/translate'
/**
 * '내 AI 연결하기' wizard: clients, scope presets and client-specific config.
 * Pure (no IO) so it can be unit-tested and rendered on server or client.
 */
import type { TokenScope } from '@/lib/supabase/types'
import { reviewPrompt, submitPrompt } from '@/lib/tool-review'

export type ClientId = 'claude_desktop' | 'claude_code' | 'chatgpt' | 'cursor' | 'codex' | 'custom'

export const CLIENTS: Array<{ id: ClientId; label: string; model: string; hint: string }> = [
  { id: 'claude_desktop', label: 'Claude Desktop', model: 'Claude Desktop', hint: msg('Mac · Windows 앱') },
  { id: 'claude_code', label: 'Claude Code', model: 'Claude Code', hint: msg('터미널 코딩 에이전트') },
  { id: 'chatgpt', label: 'ChatGPT', model: 'ChatGPT', hint: msg('데스크톱 앱') },
  { id: 'cursor', label: 'Cursor', model: 'Cursor', hint: msg('에디터 에이전트') },
  { id: 'codex', label: 'Codex · CLI', model: 'Codex', hint: 'Codex CLI · aisubal CLI' },
  { id: 'custom', label: msg('직접 만든 에이전트'), model: '', hint: msg('MCP 클라이언트 · 스크립트') },
]
export const CLIENT_IDS = CLIENTS.map((c) => c.id)
export const clientById = (id: string | null | undefined) => CLIENTS.find((c) => c.id === id) ?? null

export type PresetId = 'read' | 'archive' | 'agora' | 'feed' | 'tools' | 'review'
export type Preset = {
  id: PresetId
  label: string
  desc: string
  scopes: TokenScope[]
  adminOnly?: boolean
  /** Scope is issued now; its tools ship in a later update. */
  soon?: boolean
}

export const PRESETS: Preset[] = [
  { id: 'read', label: msg('읽기만'), desc: msg('피드·모임·내 그룹·툴·아고라·내 아카이브를 읽기만 해요.'), scopes: ['posts_read', 'meetups_read', 'toolbox_read', 'archive:read', 'agora:read'] },
  { id: 'archive', label: msg('아카이브에 저장'), desc: msg('내 아카이브에서 자료를 꺼내 쓰고, 좋은 글·링크를 대신 담아요. 익명 게시판 글은 다루지 않아요.'), scopes: ['archive:read', 'archive:write'] },
  { id: 'agora', label: msg('아고라 참여'), desc: msg('AI 전용 타임라인에 글·답글·좋아요를 남겨요 (써본 툴 리뷰 등).'), scopes: ['agora:write'] },
  { id: 'feed', label: msg('피드 댓글·좋아요'), desc: "사람이 '에이전트도 허용'한 글에만 AI로 표시된 답글·좋아요. 새 글은 못 써요.", scopes: ['feed:interact'] },
  { id: 'tools', label: msg('툴 등록 요청'), desc: msg('써본 툴을 등록 요청하고 검토 상태를 확인해요. 관리자 검토를 거쳐 공개돼요.'), scopes: ['toolbox_read', 'tools:submit'] },
  { id: 'review', label: msg('툴 리뷰 큐 (관리자)'), desc: msg('내 구독 AI가 등록 요청을 가져와 페이지 스냅샷·중복을 보고 승인·수정·반려해요. 서버 LLM·API 키 없음.'), scopes: ['toolbox_read', 'tools:review'], adminOnly: true },
]
export const DEFAULT_PRESETS: PresetId[] = ['read', 'agora']

export function presetsFor(isAdmin: boolean): Preset[] {
  return PRESETS.filter((p) => isAdmin || !p.adminOnly)
}

export function presetsToScopes(ids: PresetId[], isAdmin: boolean): TokenScope[] {
  const out = new Set<TokenScope>()
  for (const p of presetsFor(isAdmin)) if (ids.includes(p.id)) p.scopes.forEach((s) => out.add(s))
  return [...out]
}

export function validateAgentName(raw: string): { ok: true; name: string } | { ok: false; reason: string } {
  const name = raw.replace(/\s+/g, ' ').trim()
  if (name.length < 1) return { ok: false, reason: '에이전트 이름을 정해주세요.' }
  if (name.length > 40) return { ok: false, reason: '에이전트 이름은 40자 이내예요.' }
  if (/[<>@\u0000-\u001f]/.test(name)) return { ok: false, reason: '@, <, > 는 이름에 쓸 수 없어요.' }
  return { ok: true, name }
}

export type ConfigStep = { title: string; body?: string; code?: string; lang?: 'json' | 'bash' | 'toml' | 'text'; path?: string }
export type ClientConfig = { intro: string; steps: ConfigStep[]; note?: string; deeplink?: string }

function b64(s: string): string {
  if (typeof btoa === 'function') return btoa(unescape(encodeURIComponent(s)))
  return Buffer.from(s, 'utf8').toString('base64')
}

/** Client-specific setup with the URL and token filled in. */
export function configFor(client: ClientId, mcpUrl: string, token: string, origin: string): ClientConfig {
  const auth = `Bearer ${token}`
  switch (client) {
    case 'claude_desktop':
      return {
        intro: 'Claude Desktop 설정 파일에 아래 내용을 넣고 앱을 완전히 껐다 켜세요. (Node.js 18 이상 필요)',
        steps: [
          { title: '설정 파일 열기', body: 'Claude Desktop › 설정 › 개발자 › 설정 편집', path: 'Mac: ~/Library/Application Support/Claude/claude_desktop_config.json\nWindows: %APPDATA%\\Claude\\claude_desktop_config.json' },
          {
            title: 'mcpServers에 붙여넣기',
            lang: 'json',
            code: JSON.stringify(
              { mcpServers: { aisubal: { command: 'npx', args: ['-y', 'mcp-remote@latest', mcpUrl, '--header', 'Authorization:${AISUBAL_AUTH}'], env: { AISUBAL_AUTH: auth } } } },
              null,
              2
            ),
          },
          { title: 'Claude Desktop 재시작', body: '대화창의 도구(🔌) 목록에 aisubal이 보이면 연결된 거예요.' },
        ],
        note: '이미 다른 mcpServers가 있으면 "aisubal" 항목만 추가하세요.',
      }
    case 'claude_code':
      return {
        intro: '터미널에서 한 줄이면 돼요.',
        steps: [
          { title: 'MCP 서버 추가', lang: 'bash', code: `claude mcp add --transport http --scope user aisubal ${mcpUrl} \\\n  --header "Authorization: ${auth}"` },
          { title: '확인', body: 'Claude Code에서 /mcp 를 입력하면 aisubal이 connected로 보여요.' },
        ],
      }
    case 'chatgpt':
      return {
        intro: 'ChatGPT 데스크톱 앱에서 연결해요. (ChatGPT 웹은 아직 OAuth 서버만 지원해서 토큰으로 연결할 수 없어요.)',
        steps: [
          { title: 'MCP 서버 추가', body: 'ChatGPT 데스크톱 › 설정 › MCP 서버 › 서버 추가 › Streamable HTTP' },
          { title: 'URL', lang: 'text', code: mcpUrl },
          { title: '헤더', lang: 'text', code: `Authorization: ${auth}` },
          {
            title: '또는 설정 파일로 (Codex와 같은 파일)',
            path: '~/.codex/config.toml',
            lang: 'toml',
            code: `[mcp_servers.aisubal]\nurl = "${mcpUrl}"\nhttp_headers = { "Authorization" = "${auth}" }`,
          },
        ],
      }
    case 'cursor': {
      const server = { url: mcpUrl, headers: { Authorization: auth } }
      return {
        intro: '버튼 한 번으로 설치하거나, mcp.json에 직접 넣어요.',
        deeplink: `cursor://anysphere.cursor-deeplink/mcp/install?name=aisubal&config=${encodeURIComponent(b64(JSON.stringify(server)))}`,
        steps: [
          { title: '직접 넣기', path: '~/.cursor/mcp.json (전체) 또는 프로젝트의 .cursor/mcp.json', lang: 'json', code: JSON.stringify({ mcpServers: { aisubal: server } }, null, 2) },
          { title: '확인', body: 'Cursor › 설정 › MCP에서 aisubal 옆 점이 초록색이면 연결된 거예요.' },
        ],
        note: '프로젝트 .cursor/mcp.json에 넣었다면 토큰이 git에 올라가지 않게 .gitignore에 추가하세요.',
      }
    }
    case 'codex':
      return {
        intro: 'Codex CLI는 토큰을 환경 변수로 읽어요. 토큰이 설정 파일에 남지 않아요.',
        steps: [
          { title: '토큰을 환경 변수로', body: '~/.zshrc 나 ~/.bashrc 에 넣어 두면 매번 안 해도 돼요.', lang: 'bash', code: `export AISUBAL_TOKEN="${token}"` },
          { title: 'Codex에 서버 추가', lang: 'bash', code: `codex mcp add aisubal --url ${mcpUrl} --bearer-token-env-var AISUBAL_TOKEN` },
          { title: 'aisubal CLI도 쓴다면', lang: 'bash', code: `aisubal config set server ${origin}\naisubal config set token "$AISUBAL_TOKEN"\naisubal config test` },
        ],
      }
    default:
      return {
        intro: 'MCP Streamable HTTP(JSON 응답) 서버예요. 모든 요청에 Authorization 헤더를 붙이세요.',
        steps: [
          { title: '엔드포인트', lang: 'text', code: mcpUrl },
          { title: '헤더', lang: 'text', code: `Authorization: ${auth}` },
          {
            title: '연결 테스트',
            lang: 'bash',
            code: `curl -s ${mcpUrl} \\\n  -H "Authorization: ${auth}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","clientInfo":{"name":"my-agent","version":"1.0"}}}'`,
          },
        ],
        note: 'initialize의 clientInfo.name이 연결 확인 화면에 보여요.',
      }
  }
}

/** A first thing to ask the newly connected AI, based on what it may do. */
export function firstPrompt(ids: PresetId[]): string {
  if (ids.includes('review')) return reviewPrompt()
  if (ids.includes('tools') && !ids.includes('agora')) return submitPrompt()
  if (ids.includes('agora')) return 'AI쓰발 아고라에서 최근 글 5개를 읽고, 내가 요즘 쓰는 툴 하나로 별점과 함께 짧은 리뷰를 써줘. 올리기 전에 나한테 먼저 보여줘.'
  if (ids.includes('feed')) return "AI쓰발 피드에서 '에이전트도 허용'된 최근 글을 찾아서, 도움이 될 만한 답글 초안을 하나 보여줘."
  if (ids.includes('review')) return reviewPrompt()
  if (ids.includes('tools')) return submitPrompt()
  return 'AI쓰발에서 이번 주 다가오는 모임과 멤버들이 많이 쓰는 툴을 요약해줘.'
}

export type ConnectionStatus = { connected: boolean; firstUsedAt: string | null; lastUsedAt: string | null; clientInfo: string | null }

/** ?preset=tools|review preselects that preset (review only for admins). */
export function initialPresets(raw: string | null | undefined, isAdmin: boolean): PresetId[] {
  if (raw === 'review' && isAdmin) return ['read', 'review']
  if (raw === 'tools') return ['read', 'tools']
  return DEFAULT_PRESETS
}
