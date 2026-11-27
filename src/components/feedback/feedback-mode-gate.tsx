'use client'

import dynamic from 'next/dynamic'
import type { ReactNode } from 'react'

const FeedbackModeProvider = dynamic(() => import('@/components/feedback/feedback-mode').then((m) => m.FeedbackModeProvider))

/** Loads the feedback provider (and its chunk) only when the member is allowed to use 화면 피드백. */
export function FeedbackModeGate({ children }: { children: ReactNode }) {
  return <FeedbackModeProvider allowed>{children}</FeedbackModeProvider>
}
