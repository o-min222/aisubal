# AI쓰발 디자인 시스템

Product Hunt / Disquiet 스타일의 클린하고 밝은 UI

## 컬러 팔레트

### 브랜드 컬러
- **Primary (Black)**: `#000000` - 로고, 버튼, 주요 액션
- **Primary Hover**: `#1a1a1a` - 호버 상태

### 뉴트럴 컬러
| 용도 | 컬러 | Hex |
|------|------|-----|
| 배경 (Primary) | 화이트 | `#ffffff` |
| 배경 (Secondary) | 연한 회색 | `#fafafa` |
| 배경 (Tertiary) | 회색 | `#f5f5f5` |
| 텍스트 (Primary) | 진한 검정 | `#1a1a1a` |
| 텍스트 (Secondary) | 중간 회색 | `#4a4a4a` |
| 텍스트 (Muted) | 연한 회색 | `#8a8a8a` |
| 테두리 (Default) | 연한 회색 | `#e5e5e5` |
| 테두리 (Light) | 아주 연한 회색 | `#f0f0f0` |

### 에셋 타입 뱃지 컬러
| 타입 | 배경색 | 텍스트색 |
|------|--------|----------|
| SKILL | `#ecfdf5` | `#059669` |
| MCP | `#eff6ff` | `#2563eb` |
| RULES | `#fef3c7` | `#d97706` |
| PROMPT | `#f3e8ff` | `#7c3aed` |
| NOTE | `#f5f5f5` | `#8a8a8a` |

## 타이포그래피

### 폰트
- **본문**: Pretendard Variable (한국어 최적화 sans-serif)
- **코드**: JetBrains Mono

### 폰트 사이즈
| 요소 | 크기 | 행간 | 무게 |
|------|------|------|------|
| H1 | 2rem | 1.2 | 700 |
| H2 | 1.5rem | 1.3 | 700 |
| H3 | 1.25rem | 1.4 | 700 |
| Body | 1rem | 1.6 | 400 |
| Small | 0.875rem | 1.5 | 400 |
| Caption | 0.75rem | 1.5 | 400 |

## 컴포넌트

### 버튼
```css
/* Primary Button */
.btn-primary {
  background: #000000;
  color: #ffffff;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  font-weight: 500;
}

.btn-primary:hover {
  background: #1a1a1a;
}

/* Secondary Button */
.btn-secondary {
  background: #ffffff;
  color: #1a1a1a;
  border: 1px solid #e5e5e5;
}
```

### 카드
```css
.card {
  background: #ffffff;
  border: 1px solid #f0f0f0;
  border-radius: 0.75rem;
  transition: all 0.15s ease;
}

.card:hover {
  border-color: #e5e5e5;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}
```

### 뱃지
```css
.badge {
  padding: 0.25rem 0.5rem;
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-radius: 0.25rem;
}
```

### 입력 필드
```css
.input {
  padding: 0.625rem 0.875rem;
  background: #ffffff;
  border: 1px solid #e5e5e5;
  border-radius: 0.5rem;
}

.input:focus {
  border-color: #000000;
  box-shadow: 0 0 0 3px #f5f5f5;
}
```

### 아바타
```css
.avatar {
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  background: #000000;
  color: #ffffff;
  font-weight: 600;
}
```

## 레이아웃

### 간격 (Spacing)
- xs: 0.25rem (4px)
- sm: 0.5rem (8px)
- md: 1rem (16px)
- lg: 1.5rem (24px)
- xl: 2rem (32px)
- 2xl: 3rem (48px)

### Border Radius
- sm: 0.25rem
- default: 0.5rem
- lg: 0.75rem
- xl: 1rem
- full: 9999px

### 반응형 Breakpoints
- sm: 640px
- md: 768px
- lg: 1024px
- xl: 1280px

## 로고

### 메인 로고
"AI발" 스타일라이즈된 bold italic 워드마크
- 화이트 버전: 검정 배경에서 사용 (랜딩, 로그인)
- 블랙 버전: 화이트 배경에서 사용 (헤더)

### 사용 가이드
```jsx
// 헤더 (블랙 로고)
<svg viewBox="0 0 200 56" width="100" height="28" fill="#000000">
  ...
</svg>

// 랜딩/로그인 (화이트 로고)
<div className="bg-black rounded-xl p-4">
  <svg viewBox="0 0 200 56" width="120" height="34" fill="#ffffff">
    ...
  </svg>
</div>
```

## 페이지 구조

### 랜딩 페이지
- 최소화된 디자인: 로고 + 로그인 폼 + 초대 코드 입력
- 블랙 배경, 화이트 로고
- 마케팅 카피 없음

### 인증 페이지 (로그인/가입)
- 카드 중앙 배치
- 블랙 배경의 로고 블록
- 연한 회색 배경 (#fafafa)

### 피드 페이지
- 2컬럼 레이아웃 (메인 피드 + 사이드바)
- 카드 기반 게시물 목록
- 저장 카운트 표시
- 사이드바: 트렌딩, 에셋 타입 필터, 커뮤니티 통계

### 게시물 상세
- 넓은 여백
- 에셋 타입별 색상 구분
- 명확한 복사/다운로드 버튼

## 접근성

- 충분한 색상 대비 (WCAG AA 준수)
- 키보드 네비게이션 지원
- 포커스 상태 명확히 표시
- 한국어 최적화 폰트 사용

## Compact service chip (`ServiceChip`)
One chip for AI stack, subscriptions, skills and tools everywhere (profile card, member peek, profile page, inline editor, tool users): ~24px tall, 12px text, 14px logo, tight padding, dense wrap, `+N` in the 6th slot. Logo order: catalog icon → known service logo (`src/lib/service-logos.ts`, served by `/api/icon/[key]` from a fixed allowlist, CDN-cached so browsers never contact third parties) → tiny colored letter mark.

## Dark mode

**Preference.** System / Light / Dark. The `theme` cookie is primary (works signed out). Members also save it to `members.theme` via `member_set_theme` (migration 0028), so a new device picks it up. Precedence: cookie → profile → `system`. It's set through `POST /api/theme` by `ThemeSwitch`:
- `variant="row"`: the account menu, next to 언어.
- `variant="block"`: 설정 › 계정 › 화면 모드.

The switch applies instantly (no reload).

**No flash.** The root layout renders `<html data-theme=… class="dark">` from the cookie. For `system`, an inline head script (`THEME_BOOT_SCRIPT` in `src/lib/theme.ts`) resolves `prefers-color-scheme` before first paint and keeps following the OS while the page is open. `theme-color` and `color-scheme` meta come from `generateViewport`: #f7f7f7 in light, #0f0f0f in dark.

**Tokens.** Every neutral and status color is a CSS variable:
- `--n-<hex>`: neutrals, named after their **light** value, e.g. `--n-111` or `--n-f2f2f2`.
- `--c-<hex>`: status and tint colors (links, success, warning, danger, badges).

`:root` holds the light values (the original palette, so light mode is pixel-identical). `.dark` remaps them:
- Neutrals follow a lightness curve: text gets lighter, surfaces get darker.
- Cards use `--n-fff` (#191919) and sit above the page `--bg-base` (#0f0f0f).
- Status colors are hand-picked to pass WCAG AA on dark surfaces.

Every token is also a Tailwind color, so you can write `text-n-666`, `bg-n-fff`, `border-n-eee` or `text-c-06c`.

**Rules for new code:**
- Never write a neutral hex such as `#111`, `#888` or `#f2f2f2`, or `bg-white`. Use the token.
- White text on a *colored* surface (avatar letters, brand marks, `.svc-letter`, `.anon-banner`) stays literal `#fff`/`text-white`.
- On an *inverted* surface (`bg-n-111`), use `text-n-fff` so the pair flips together.
- Brand and hue colors (service logos, avatar hues, platform icons) stay literal.
- OG images (`next/og`) can't read CSS variables. Keep literal colors there.
- The black PNG wordmark gets `logo-ink`, which inverts it in dark.

**Contrast in dark (card #191919):**
- 111 → 14.9
- 555 → 7.8
- 777 → 5.8
- 888 → 5.2
- 999 → 4.7
- link → 7.3
- danger → 7.0

`n-aaa` (3.7) is only for placeholders and decorations, as it is in light.

**Checks.**
- `npm run check:overflow -- --themes light,dark` runs every route × width in both themes.
- `tests/theme.test.ts` asserts every token has a dark value and every used token is defined.
