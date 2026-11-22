# 기여 가이드

AI쓰발 코드베이스에 기여해 주셔서 감사합니다. 커뮤니티 **콘텐츠·멤버십**은 초대 전용이고, 이 저장소의 **애플리케이션 코드**는 오픈소스입니다.

## 로컬 실행 (목 데이터)

```bash
npm install
cp .env.example .env
# DEV_BYPASS_AUTH=true 가 기본입니다 — Google/Supabase 없이 시드 UI를 봅니다
npm run dev
```

브라우저: `http://localhost:43210` (또는 `package.json`의 포트)

실제 Supabase + Google 로그인으로 돌리려면 `.env`에서 `DEV_BYPASS_AUTH=false`로 두고, README의 스키마·OAuth 설정을 따릅니다.

## 브랜치 / PR

1. `main`에서 기능 브랜치를 만듭니다. 예: `feat/invite-copy`, `fix/link-card-fallback`
2. 관련 테스트가 있으면 통과시킵니다: `npx vitest run`
3. `npx tsc --noEmit` 및 가능하면 `npm run build`를 확인합니다
4. PR에는 **무엇을 / 왜** 바꿨는지 짧게 적어 주세요 (한국어·영어 모두 OK)

## 코드 스타일

- TypeScript + App Router. 새 UI는 기존 Tailwind/컴포넌트 패턴을 따릅니다
- 서버 데이터는 `src/lib/data/*` 듀얼 모드(목 / Supabase)를 우선 사용합니다
- 시크릿(`.env`, 서비스 롤 키)은 커밋하지 않습니다. `.env.example`만 갱신하세요
- 스키마 변경은 `supabase/migrations/`에 **새 파일**로 추가하고, 이미 적용된 `0001`/`0002`는 수정하지 않습니다

## 이슈

버그·제안은 GitHub Issues에 남겨 주세요. 보안 이슈는 공개 이슈 대신 유지보수자에게 직접 알려 주시면 좋습니다.
