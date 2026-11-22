/** Columns safe for authenticated SELECT after email privilege revoke (0002). */
export const MEMBER_PUBLIC_COLUMNS =
  'id, auth_id, display_name, bio, avatar_url, nickname, nickname_bio, nickname_avatar_url, nickname_created_at, is_admin, is_banned, banned_at, banned_reason, invited_by_id, invite_code_used, signup_completed_at, created_at, updated_at'

/** PostgREST embed for author/host/maker joins — never include email. */
export const MEMBER_EMBED =
  'id, display_name, bio, avatar_url, nickname, nickname_bio, nickname_avatar_url, nickname_created_at, is_admin, is_banned, signup_completed_at, created_at, updated_at'
