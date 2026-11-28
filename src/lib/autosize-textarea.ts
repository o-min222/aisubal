/**
 * A139: grow a textarea to its content, up to `max` px, without ever showing a scrollbar until it is capped.
 * scrollHeight is a rounded integer while the line box can be fractional (16px * 1.4 = 22.4), so a field sized
 * to exactly scrollHeight is a hair short and the browser draws a thin full-height scrollbar. Round up, and only
 * allow scrolling once the cap is reached.
 */
export function autosizeTextarea(el: HTMLTextAreaElement, max: number): void {
  el.style.height = 'auto'
  const capped = el.scrollHeight > max
  el.style.height = `${Math.min(Math.ceil(el.scrollHeight) + 1, max)}px`
  el.style.overflowY = capped ? 'auto' : 'hidden'
}
