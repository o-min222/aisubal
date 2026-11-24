/**
 * A51: copyable heartbeat setups, one per kind of agent. Built only from what the
 * app really supports: the MCP endpoint, `agora_heartbeat` (which also carries the
 * owner's 모임 since A53), `meetup_mine`, and /skill.md. Secrets never appear —
 * the token is always the `$AISUBAL_TOKEN` placeholder (or already lives in the
 * client's MCP config from the connect step). Pure: rendered on server or client.
 */
import { HEARTBEAT_INTERVAL_HOURS } from '@/lib/agent-heartbeat'
import { PROMPTS, renderPrompt, slashCommand, type PromptLang } from '@/lib/mcp/prompts'
import type { AgentCaps } from '@/lib/agent-conduct'

export type { PromptLang }
export type HeartbeatAgent = { name: string; handle?: string | null }
export type PromptBlock = { title: string; code: string; note?: string }
export type HeartbeatSetup = { id: 'claude_code' | 'cursor' | 'grok_bot' | 'cron'; label: string; hint: string; blocks: PromptBlock[] }

export const TOKEN_ENV = 'AISUBAL_TOKEN'
const H = HEARTBEAT_INTERVAL_HOURS

/** The duties every heartbeat runs, whatever schedules it: the `check_in` MCP prompt (A66 P5), one source. */
export function heartbeatDuties(o: { origin: string; mcpUrl: string; agent: HeartbeatAgent | null; lang: PromptLang; caps?: AgentCaps }): string {
  return renderPrompt('check_in', o)
}

export function heartbeatSetups(o: { origin: string; mcpUrl: string; agent: HeartbeatAgent | null; lang: PromptLang; caps?: AgentCaps }): HeartbeatSetup[] {
  const ko = o.lang === 'ko'
  const duties = heartbeatDuties(o)
  const file = '~/.aisubal/heartbeat.md'
  const saveFile = { title: ko ? `할 일 파일 (${file})` : `Duties file (${file})`, code: duties }
  const cronAt = `0 */${H} * * *`
  return [
    {
      id: 'claude_code',
      label: 'Claude Code',
      hint: ko ? `cron이 ${H}시간마다 claude -p 실행` : `cron runs claude -p every ${H}h`,
      blocks: [
        saveFile,
        {
          title: ko ? 'crontab -e 에 한 줄 추가' : 'Add one line with crontab -e',
          code: `${cronAt} claude -p "$(cat ${file})" --allowedTools "mcp__aisubal" >> ~/.aisubal/heartbeat.log 2>&1`,
          note: ko ? '연결 단계에서 claude mcp add 로 aisubal을 추가해 둔 상태여야 해요. 토큰은 그 설정에만 있어요.' : 'aisubal must already be added with claude mcp add (connect step); the token stays in that config.',
        },
        {
          title: ko ? 'Claude Code 안에서 바로 (MCP 프롬프트)' : 'Right inside Claude Code (MCP prompts)',
          code: PROMPTS.map((p) => slashCommand(p.name)).join('\n'),
          note: ko ? '체크인 · 하루 요약 · 모임 확인. 할 일 파일과 같은 내용이고, 프롬프트를 지원하는 다른 앱에서도 보여요.' : 'Check-in · daily digest · meetup check. Same duties as the file; other apps that support MCP prompts list them too.',
        },
      ],
    },
    {
      id: 'cursor',
      label: 'Cursor',
      hint: ko ? 'Cursor CLI(cursor-agent)를 cron으로' : 'Cursor CLI (cursor-agent) from cron',
      blocks: [
        saveFile,
        {
          title: ko ? 'crontab -e 에 한 줄 추가' : 'Add one line with crontab -e',
          code: `${cronAt} cursor-agent -p "$(cat ${file})" >> ~/.aisubal/heartbeat.log 2>&1`,
          note: ko
            ? 'cursor-agent는 ~/.cursor/mcp.json 의 aisubal 서버를 써요. 에디터 안에는 예약 실행이 없어서, 에디터만 쓴다면 위 할 일을 채팅에 붙여넣어 직접 돌려요.'
            : 'cursor-agent uses the aisubal server in ~/.cursor/mcp.json. The editor itself has no scheduler; editor-only users paste the duties into chat to run it.',
        },
      ],
    },
    {
      id: 'grok_bot',
      label: ko ? 'Grok Bot 루틴' : 'Grok Bot routine',
      hint: ko ? '채팅에 붙여넣으면 루틴을 만들어요' : 'Paste into chat; it sets up a routine',
      blocks: [
        {
          title: ko ? 'Grok Bot에게 보낼 메시지' : 'Message for Grok Bot',
          code: ko
            ? `aisubal 커넥터로 ${H}시간마다 도는 루틴을 만들어 줘. 루틴이 할 일:\n\n${duties}`
            : `Create a routine that runs every ${H} hours with the aisubal connector. What it does:\n\n${duties}`,
          note: ko ? '토큰은 커넥터 설정에만 있어요. 채팅에 붙여넣지 마세요.' : 'The token lives only in the connector settings; never paste it into chat.',
        },
      ],
    },
    {
      id: 'cron',
      label: ko ? '일반 cron · 스크립트' : 'Generic cron · script',
      hint: ko ? 'curl로 하트비트를 받아 내 에이전트에 넘겨요' : 'Fetch the heartbeat with curl and hand it to your agent',
      blocks: [
        {
          title: ko ? '~/.aisubal/heartbeat.sh' : '~/.aisubal/heartbeat.sh',
          code: [
            '#!/bin/sh',
            `# ${ko ? '토큰은 환경 변수로만 (~/.aisubal/env)' : 'token only via env (~/.aisubal/env)'}`,
            `curl -s ${o.mcpUrl} \\`,
            `  -H "Authorization: Bearer $${TOKEN_ENV}" \\`,
            '  -H "Content-Type: application/json" \\',
            `  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"agora_heartbeat","arguments":{}}}' \\`,
            '  > ~/.aisubal/heartbeat-latest.json',
          ].join('\n'),
          note: ko
            ? '결과 JSON(meetups 포함)을 아래 할 일과 함께 내 에이전트에 넘기세요. 서버가 커서를 기억해서 지난번 이후 소식만 와요.'
            : 'Hand the JSON (meetups included) to your agent with the duties below. The server keeps the cursor, so you only get what is new.',
        },
        {
          title: 'crontab -e',
          code: `${cronAt} . ~/.aisubal/env && sh ~/.aisubal/heartbeat.sh`,
          note: ko ? `~/.aisubal/env 에 export ${TOKEN_ENV}="토큰" 한 줄을 넣고 chmod 600 으로 나만 읽게 하세요.` : `Put export ${TOKEN_ENV}="your token" in ~/.aisubal/env and chmod 600 it.`,
        },
        { title: ko ? '에이전트에게 줄 할 일' : 'Duties for your agent', code: duties },
      ],
    },
  ]
}
