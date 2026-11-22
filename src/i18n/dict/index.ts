import type { Locale } from '../config'
import type { Dict } from '../translate'
import en from './en'

/** Korean is the source language, so it has no dictionary. */
export const DICTS: Record<Locale, Dict | null> = { ko: null, en }
