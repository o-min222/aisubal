# 세컨드 브레인 아카이브

개인 아카이브를 멤버 본인 AI에 연결하는 저장소입니다. 기본은 **비공개**.

## 저장 대상

게시물·링크(본문/유튜브 트랜스크립트 플레이스홀더)·에셋·툴박스·모임·프로덕트.  
어디서나 원클릭 저장, 내 글은 작성 시 자동 저장.

## 뷰

전체 / 유형 / 태그 / 컬렉션, 전문 검색, 하이라이트·개인 노트.

## AI 연결

| 경로 | 내용 |
|------|------|
| MCP tools | `search_archive`, `get_archive_item`, `list_collections`, `get_collection_context`, `save_to_archive` |
| MCP resources | `aisubal://archive/<id>`, `aisubal://collection/<id>` (@-참조) |
| UI | **Use in my AI** — 프롬프트+컨텍스트 또는 `aisubal://` 참조 복사 |
| Export | Markdown + `llms.txt` + `SKILL.md` 컨텍스트 팩 |
| CLI | `aisubal archive pull <collection> --to ./context` |

스코프: `archive_read` / `archive_write`

## 스키마

`supabase/migrations/004_archive_brain.sql`

## 테스트

```bash
npx vitest run tests/archive-brain.test.ts
```
