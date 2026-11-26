/** A105: mock-mode copy of site_config.feedback_picker (prod reads it inside feedback__allowed()). */
const g = globalThis as unknown as { __aisubalFeedbackPicker?: boolean }
export function mockFeedbackPicker(on?: boolean): boolean {
  if (on !== undefined) g.__aisubalFeedbackPicker = on
  return g.__aisubalFeedbackPicker ?? true
}
