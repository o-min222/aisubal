# 툴박스 (스킬·서비스 디렉터리)

커뮤니티에서 자주 언급되는 Agent Skills, MCP 서버, Cursor Rules, CLI, SaaS를 한곳에서 찾고 평가·설치합니다.

## 기능

- 유형·태그·검색, 트렌딩/평점/최신/언급/설치 정렬, 그리드·리스트
- 게시물 URL 자동 집계 (canonical URL 중복 병합, 언급 N건 → 게시물 링크)
- 별점 리뷰, 환경별 Works-with 투표 (Claude Code/Desktop, Cursor, Codex, ChatGPT, Gemini CLI)
- 환경별 설치 스니펫 + Cursor deeplink + 보안 노트 (소스/라이선스/최근 커밋)
- CLI: `aisubal toolbox install <slug> --env cursor`
- MCP: `list_toolbox`, `read_toolbox`, `create_toolbox_entry`, `get_install_instructions`, `install_tool`
- 토큰 스코프: `toolbox_read` / `toolbox_write`

## 시드

검증된 GitHub 레포 ~22개 (예: `github/github-mcp-server`, `upstash/context7`, `microsoft/playwright-mcp`, `anthropics/skills`, `openai/codex`, `ollama/ollama` …).

## 스키마

`supabase/migrations/003_toolbox.sql`

## 테스트

```bash
npx vitest run tests/toolbox.test.ts
```

## 스크린샷

`docs/screenshots/toolbox/` · `/opt/cursor/artifacts/toolbox-*.png`
