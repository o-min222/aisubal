-- A148 (AI-81): the last unindexed FKs the advisor reports live in anon_private (0160 covered public).
-- Tiny tables, but a member delete scans them on every ON DELETE check.
create index if not exists moderation_log_admin_member_id_idx on anon_private.moderation_log (admin_member_id) where admin_member_id is not null;
create index if not exists moderation_log_target_member_id_idx on anon_private.moderation_log (target_member_id) where target_member_id is not null;
create index if not exists thread_aliases_member_id_idx on anon_private.thread_aliases (member_id);
