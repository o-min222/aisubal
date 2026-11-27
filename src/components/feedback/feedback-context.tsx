'use client'

import { createContext, useContext, type MouseEvent as ReactMouseEvent } from 'react'

export type FeedbackModeCtx = {
  allowed: boolean
  on: boolean
  setOn: (v: boolean) => void
  logoClick: (e: ReactMouseEvent) => void
}

export const FeedbackCtx = createContext<FeedbackModeCtx>({
  allowed: false,
  on: false,
  setOn: () => {},
  logoClick: () => {},
})

export const useFeedbackMode = () => useContext(FeedbackCtx)
