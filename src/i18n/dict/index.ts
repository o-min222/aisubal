import type { Locale } from '../config'
import type { Dict } from '../translate'
import en from './en'
import enShell from './en-areas/common'

/** Korean is the source language, so it has no dictionary. */
export const DICTS: Record<Locale, Dict | null> = { ko: null, en }

/**
 * A149: what the root layout sends to the browser: the shell namespace only. Each area's segment
 * layout adds its own (src/i18n/area.tsx). The server keeps translating with the full DICTS.
 */
export const SHELL_DICTS: Record<Locale, Dict | null> = { ko: null, en: enShell }
