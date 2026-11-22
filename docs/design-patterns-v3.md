# Redesign v3 — 참고 사이트에서 가져온 패턴

참고 스크린샷: `docs/screenshots/redesign-v3/reference/`  
After 스크린샷: `docs/screenshots/redesign-v3/after-*.png` 및 `/opt/cursor/artifacts/`

## Disquiet (disquiet.io)

- **3열 그리드**: 좌측 필터 내비 / 중앙 피드 / 우측 모듈 (트렌딩·태그)
- **헤더**: 로고 좌측, 텍스트+아이콘 내비, 우측 CTA + 아바타
- **피드 아이템**: 좌측 썸네일, 제목(굵게)·한 줄 설명·메타(아바타·이름·시간), 우측 업보트 박스
- **탭 필터**: `인기` / `최신` — 활성 탭만 굵게 + 하단 보더
- **1px 보더 + near-white 배경** (`#f7f7f7` / `#fff`), 카드 그림자는 거의 없음
- **사이드 모듈**: 번호 매긴 트렌딩 리스트, 태그 칩
- **모바일**: 하단 탭바, 좌/우 사이드바 숨김

## Product Hunt

- **업보트 UI**: 세로형 버튼에 chevron + 숫자 (우측 정렬)
- **타이포 대비**: 제목 강하게, 태그라인/설명은 muted gray
- **배지**: 작은 컬러 칩으로 카테고리 구분
- **호버**: 카드 보더만 살짝 진해짐 (그림자 남발 없음)
- **헤더 CTA**: 어두운 solid 버튼으로 “글쓰기” 강조

## AI쓰발에 적용한 것

- Pretendard Variable + JetBrains Mono
- 공식 `logo-black.png` / `logo-white.png`만 사용 (SVG 재작성 없음)
- 한국어 시드 콘텐츠 (빈 플레이스홀더 화면 방지)
- 에셋 타입 배지: SKILL / MCP / RULES / PROMPT / NOTE
- 로그인: 다크 풀스크린 + 화이트 로고 + Google 전용 버튼
