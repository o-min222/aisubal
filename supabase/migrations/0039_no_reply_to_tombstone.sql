-- N-1 follow-up: a deleted post/comment (tombstone, 0038) takes no new replies.
CREATE OR REPLACE FUNCTION public.posts_timeline_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  parent public.posts%ROWTYPE;
  is_client BOOLEAN := current_user IN ('authenticated', 'anon');
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF char_length(NEW.content) > 20000 THEN
      RAISE EXCEPTION 'feed_body_too_long' USING ERRCODE = 'P0001';
    END IF;
    IF char_length(btrim(NEW.content)) = 0 THEN
      RAISE EXCEPTION 'feed_body_empty' USING ERRCODE = 'P0001';
    END IF;
    IF is_client AND (NEW.author_kind <> 'member' OR NEW.agent_token_id IS NOT NULL
                      OR NEW.agent_name IS NOT NULL OR NEW.is_agent_posted) THEN
      RAISE EXCEPTION 'feed_agent_fields_forbidden' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.parent_id IS NOT NULL THEN
      SELECT * INTO parent FROM public.posts WHERE id = NEW.parent_id;
      IF NOT FOUND OR parent.is_hidden OR parent.deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'feed_parent_not_found' USING ERRCODE = 'P0001';
      END IF;
      NEW.root_id := COALESCE(parent.root_id, parent.id);
      NEW.group_id := parent.group_id;
      NEW.agent_interaction := 'humans_only';
    ELSE
      NEW.root_id := NULL;
    END IF;
    IF NEW.group_id IS NOT NULL THEN
      IF NEW.author_kind <> 'member' THEN
        RAISE EXCEPTION 'feed_group_humans_only' USING ERRCODE = 'P0001';
      END IF;
      NEW.agent_interaction := 'humans_only';
    END IF;
    NEW.like_count := 0;
    NEW.reply_count := 0;
    NEW.deleted_at := NULL;
    NEW.edited_at := NULL;
    RETURN NEW;
  END IF;

  -- UPDATE from a client session: identity/thread/counter fields are immutable,
  -- and agent-authored rows cannot be edited by their owner.
  IF is_client THEN
    IF NEW.author_kind IS DISTINCT FROM OLD.author_kind
       OR NEW.agent_token_id IS DISTINCT FROM OLD.agent_token_id
       OR NEW.agent_name IS DISTINCT FROM OLD.agent_name
       OR NEW.agent_model IS DISTINCT FROM OLD.agent_model
       OR NEW.is_agent_posted IS DISTINCT FROM OLD.is_agent_posted
       OR NEW.parent_id IS DISTINCT FROM OLD.parent_id
       OR NEW.root_id IS DISTINCT FROM OLD.root_id
       OR NEW.group_id IS DISTINCT FROM OLD.group_id
       OR NEW.author_id IS DISTINCT FROM OLD.author_id
       OR NEW.like_count IS DISTINCT FROM OLD.like_count
       OR NEW.reply_count IS DISTINCT FROM OLD.reply_count
       OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
       OR NEW.edited_at IS DISTINCT FROM OLD.edited_at THEN
      RAISE EXCEPTION 'feed_immutable_field' USING ERRCODE = 'P0001';
    END IF;
    IF OLD.author_kind = 'agent' AND (NEW.content IS DISTINCT FROM OLD.content OR NEW.title IS DISTINCT FROM OLD.title) THEN
      RAISE EXCEPTION 'feed_agent_row_readonly' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF NEW.group_id IS NOT NULL AND NEW.agent_interaction <> 'humans_only' THEN
    NEW.agent_interaction := 'humans_only';
  END IF;
  RETURN NEW;
END;
$function$;
