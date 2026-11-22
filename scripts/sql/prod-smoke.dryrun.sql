-- Prod smoke test (signed-in post → feed read → reply → like/unlike → notifications → edit → 부캐 post privacy → delete).
-- Runs as the Test and Admin members inside ONE DO block that always ends in RAISE 'DRYRUN …', so nothing persists.
-- Run with Supabase execute_sql; every field in the DRYRUN message should read ok/true/denied (never READABLE(bad)).
DO $dry$
DECLARE
  T_AUTH text := '19dffa29-bf75-4268-9a76-7cc82a9dc565'; T uuid := 'b5a63dcb-1c27-4264-8c0b-bfea3db6254e';
  A_AUTH text := '3ca06a49-94fe-423e-8940-b9f256ec9a04'; A uuid := 'e2d7887a-20d1-41b4-87fe-1a0a0f58ad40';
  top uuid; rep uuid; nickpost uuid; out text := ''; n int; j jsonb; pa uuid; ni uuid; nm text;
BEGIN
  -- 1) Test member posts (same columns the app inserts; RETURNING only readable columns)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', T_AUTH, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO posts (title, content, parent_id, group_id, agent_interaction, authorship, author_id, posted_as)
    VALUES ('', 'DRYRUN smoke post', NULL, NULL, 'humans_only', 'human', T, 'real') RETURNING id, public_author_id INTO top, pa;
  out := out || ' post=ok(public_author=' || (pa = T) || ')';
  RESET ROLE;

  -- 2) Admin reads it the way the feed does, replies, likes it
  PERFORM set_config('request.jwt.claims', json_build_object('sub', A_AUTH, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM posts p LEFT JOIN members a ON a.id = p.public_author_id LEFT JOIN nickname_profiles np ON np.id = p.nickname_id WHERE p.id = top AND a.display_name IS NOT NULL;
  out := out || ' feed_read=' || n;
  INSERT INTO posts (title, content, parent_id, author_id, posted_as) VALUES ('', 'DRYRUN smoke reply', top, A, 'real') RETURNING id INTO rep;
  out := out || ' reply=ok';
  INSERT INTO post_likes (post_id, liker_type, member_id) VALUES (top, 'member', A);
  SELECT like_count INTO n FROM posts WHERE id = top;
  out := out || ' like=ok(count=' || n || ')';
  DELETE FROM post_likes WHERE post_id = top AND member_id = A;
  SELECT like_count INTO n FROM posts WHERE id = top;
  out := out || ' unlike=ok(count=' || n || ')';
  INSERT INTO post_likes (post_id, liker_type, member_id) VALUES (top, 'member', A);
  SELECT reply_count INTO n FROM posts WHERE id = top;
  out := out || ' reply_count=' || n;
  SELECT notifications_list(NULL, 0, 20) INTO j;
  out := out || ' admin_follow_notif=' || (j::text LIKE '%follow_post%');
  RESET ROLE;

  -- 3) Test member sees reply + like notifications, edits and deletes own post
  PERFORM set_config('request.jwt.claims', json_build_object('sub', T_AUTH, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT notifications_list(NULL, 0, 20) INTO j;
  out := out || ' test_notifs(comment=' || (j::text LIKE '%DRYRUN smoke reply%') || ',like=' || (j::text LIKE '%"like%') || ')';
  PERFORM posts__edit(top, 'DRYRUN smoke post (edited)', NULL, NULL);
  out := out || ' edit=' || (SELECT content LIKE '%edited%' FROM posts WHERE id = top);

  -- 4) 부캐 post: nobody (not even via the row) can tell it's Test's
  PERFORM profile_save_nickname('dryrun_nick', '');
  INSERT INTO posts (title, content, author_id, posted_as) VALUES ('', 'DRYRUN nick post', T, 'nickname') RETURNING id INTO nickpost;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', A_AUTH, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT p.public_author_id, p.nickname_id, np.nickname INTO pa, ni, nm FROM posts p LEFT JOIN nickname_profiles np ON np.id = p.nickname_id WHERE p.id = nickpost;
  out := out || ' nick_post(public_author_null=' || (pa IS NULL) || ',nick=' || coalesce(nm, '∅') || ',nick_id_is_member=' || (ni = T) || ')';
  BEGIN PERFORM author_id FROM posts WHERE id = nickpost; out := out || ' author_id=READABLE(bad)'; EXCEPTION WHEN others THEN out := out || ' author_id=denied'; END;
  BEGIN PERFORM member_id FROM nickname_profiles LIMIT 1; out := out || ' np.member_id=READABLE(bad)'; EXCEPTION WHEN others THEN out := out || ' np.member_id=denied'; END;
  RESET ROLE;

  -- 5) delete own post
  PERFORM set_config('request.jwt.claims', json_build_object('sub', T_AUTH, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  out := out || ' delete=' || coalesce(posts__delete(top)::text, 'null');
  RAISE EXCEPTION 'DRYRUN%', out;
END $dry$;
