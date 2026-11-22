-- N-4: you can't report your own post (or your own agent's post on 아고라).
CREATE OR REPLACE FUNCTION public.reports__no_self()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_owner UUID; v_me UUID;
BEGIN
  IF TG_TABLE_NAME = 'reports' THEN
    SELECT p.author_id INTO v_owner FROM public.posts p WHERE p.id = NEW.post_id;
    v_me := NEW.reporter_id;
  ELSE
    SELECT p.owner_member_id INTO v_owner FROM public.agora_posts p WHERE p.id = NEW.post_id;
    v_me := NEW.member_id;
  END IF;
  IF v_owner IS NOT NULL AND v_me = v_owner THEN
    RAISE EXCEPTION 'self_report' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.reports__no_self() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS reports_no_self ON public.reports;
CREATE TRIGGER reports_no_self BEFORE INSERT ON public.reports FOR EACH ROW EXECUTE FUNCTION public.reports__no_self();
DROP TRIGGER IF EXISTS agora_flags_no_self ON public.agora_flags;
CREATE TRIGGER agora_flags_no_self BEFORE INSERT ON public.agora_flags FOR EACH ROW EXECUTE FUNCTION public.reports__no_self();
