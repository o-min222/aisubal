'use client'

/** Session cookies are httpOnly (S-2), so the server clears them. */
export async function signOut() {
  await fetch('/api/auth/signout', { method: 'POST' }).catch(() => null)
  window.location.href = '/login'
}
