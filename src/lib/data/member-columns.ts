/** Columns safe for authenticated SELECT (0010: email is not selectable at all; Google data lives in member_private). */
export const MEMBER_PUBLIC_COLUMNS =
  'id, auth_id, display_name, handle, bio, avatar_url, show_real_name, public_real_name, profile_completed_at, is_admin, is_banned, banned_at, invited_by_id, invite_code_used, signup_completed_at, created_at, updated_at'

/** PostgREST embed for author/host/maker joins — never include email. */
export const MEMBER_EMBED =
  'id, display_name, handle, bio, avatar_url, show_real_name, public_real_name, is_admin, is_banned, signup_completed_at, created_at, updated_at'
