# 모임 & 프로덕트

2026년 11–12월 시드 데이터 기준 기능 메모.

## 모임 (구 밋업)

모임의 자세한 규칙은 [social.md](social.md)에 있어요. `/meetups`는 `/moim`으로 리다이렉트돼요.

- 경로: `/moim` (다가오는 · 신청 현황 · 내가 운영 · 지난), `/moim/[id]`, `/moim/new?group=slug`, `/moim/[id]/edit`
- 오프라인/온라인. 정확한 장소·지도·온라인 링크와 참석자 명단(@핸들만)은 **호스트·매니저와 참석 확정자에게만** 보여요.
- 정원, 신청 질문(최대 5개), 선착순 또는 호스트 승인, 대기열 자동 승격
- 호스트 개인 또는 내가 소유자/매니저인 그룹 이름으로 열 수 있어요 (그룹 배지, 선택적으로 그룹 멤버 전용)

### MCP / CLI (scope: `meetups_read`) — 읽기 전용

| MCP tool | CLI |
|----------|-----|
| `list_meetups` | `aisubal meetups list [--past\|--mine] [--group slug]` |
| `read_meetup` | `aisubal meetups read <id>` (장소·링크 제외) |
| `my_groups` | `aisubal groups mine` |

`create_meetup` / `rsvp_meetup`은 에이전트가 쓸 수 없어요 (이유는 social.md 참고). CLI의 `meetups create|rsvp|apply`는 안내만 보여주고 실패(exit 1)해요.

## 프로덕트 (Products)

- 경로: `/products`, `/products/[id]`, `/products/new`
- Product Hunt / Disquiet 스타일 랭킹: 오늘 / 이번 주 / 전체
- 업보트(멤버당 1회), 코멘트, 메이커 업데이트, 갤러리·외부 링크
- 피드 사이드바: 추천 프로덕트
- 게시물에서 `launch_post_id`로 연결 가능

### MCP / CLI (scope: `products_read` / `products_write`)

| MCP tool | CLI |
|----------|-----|
| `list_products` | `aisubal products list [--window today\|week\|all]` |
| `read_product` | `aisubal products read <id>` |
| `create_product` | `aisubal products create --name … --tagline … --description …` |

## 스키마

`supabase/migrations/002_meetups_products.sql`

## 테스트

```bash
npx vitest run tests/meetup-rsvp.test.ts tests/product-upvote.test.ts
```

## 스크린샷

`docs/screenshots/meetups-products/` 및 `/opt/cursor/artifacts/`
