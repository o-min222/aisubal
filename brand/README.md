# AI쓰발 brand

`mark.svg` and `wordmark.svg` are the source of truth. Every favicon, PWA icon, apple-touch icon, push badge, OG card, and `logo-black.png` / `logo-white.png` is rasterized from them:

```
node scripts/gen-brand-icons.mjs
```

`scripts/gen-brand-svg.py` rebuilds the two SVGs (optional; needs Gothic A1 Black on the machine). `src/brand/logo-paths.ts` is the same path data the React wordmark uses — keep it in sync with the SVGs.
