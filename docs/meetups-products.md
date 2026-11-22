# 모임 & 프로덕트

2026년 11–12월 시드 데이터 기준 기능 메모.

## 모임 (Meetups)

- 경로: `/meetups`, `/meetups/[id]`, `/meetups/new`
- 오프라인(장소/지도) · 온라인(확정 참가자에게만 미팅 링크)
- RSVP → 정원 내 `confirmed` / 초과 `waitlisted` / 승인제 `pending`
- 호스트: 승인·거절, 공지, 취소, 지난 모임 회고(글·사진)
- 목록: 다가오는 / 지난 / 캘린더(11–12월)
- 피드 사이드바: 다가오는 모임

### MCP / CLI (scope: `meetups_read` / `meetups_write`)

| MCP tool | CLI |
|----------|-----|
| `list_meetups` | `aisubal meetups list [--past]` |
| `read_meetup` | `aisubal meetups read <id>` |
| `create_meetup` | `aisubal meetups create --title … --description … --starts ISO` |
| `rsvp_meetup` | `aisubal meetups rsvp <id> [apply\|cancel]` |

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
