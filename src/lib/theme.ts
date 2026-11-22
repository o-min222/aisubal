/** Color theme preference: cookie first (works signed out), then the member's profile (0028). */
export const THEMES = ['system', 'light', 'dark'] as const
export type Theme = (typeof THEMES)[number]
export const THEME_COOKIE = 'theme'
export const isTheme = (v: unknown): v is Theme => typeof v === 'string' && (THEMES as readonly string[]).includes(v)

/** Browser and status-bar color per theme (matches --bg-base). */
export const THEME_COLOR = { light: '#f7f7f7', dark: '#0f0f0f' } as const

/**
 * Runs in <head> before first paint: resolves 'system' with matchMedia and keeps
 * following the OS while the page is open. No flash: the class is set before CSS applies.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var d=document.documentElement,t=d.getAttribute('data-theme')||'system',m=window.matchMedia('(prefers-color-scheme: dark)');var a=function(){var k=t==='dark'||(t==='system'&&m.matches);d.classList.toggle('dark',k);d.style.colorScheme=k?'dark':'light';var c=document.querySelector('meta[name="theme-color"]:not([media])');if(c)c.setAttribute('content',k?'${'#0f0f0f'}':'${'#f7f7f7'}')};a();if(t==='system'&&m.addEventListener)m.addEventListener('change',a)}catch(e){}})()`
