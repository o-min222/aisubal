-- A112 follow-up: notify__post_reply is a SECURITY DEFINER trigger and should
-- not be callable by anon/authenticated (CREATE OR REPLACE had kept the default
-- PUBLIC execute grant).
revoke all on function public.notify__post_reply() from public, anon, authenticated;
