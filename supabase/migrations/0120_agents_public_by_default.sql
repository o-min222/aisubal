-- AI-6 (Colin, t293u): newly connected agents are public (shown on the profile) by default.
-- Reverses 0037's P-3 default for NEW agents only; existing rows keep their show_on_profile.
-- Paths: the column default, issueApiToken (wizard + 토큰만 직접 만들기, app code) and the OAuth
-- consent's first token (oauth_token_exchange, below: identical to 0115 except the new row's
-- show_on_profile). Reconnecting an existing OAuth agent keeps its current setting.
alter table public.api_tokens alter column show_on_profile set default true;

create or replace function public.oauth_token_exchange(p_code_hash text, p_client_id text, p_redirect_uri text, p_verifier_challenge text,
  p_access_hash text, p_access_prefix text, p_refresh_hash text, p_access_ttl integer, p_refresh_ttl integer) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare c public.oauth_codes%rowtype; v_tid uuid; v_now timestamptz := now();
begin
  if p_access_hash !~ '^[0-9a-f]{64}$' or p_refresh_hash !~ '^[0-9a-f]{64}$' or p_access_prefix !~ '^aisubal_[0-9a-f]{4}$' then
    raise exception 'invalid_request' using errcode = '22023';
  end if;
  select * into c from public.oauth_codes where code_hash = p_code_hash for update;
  if not found then return jsonb_build_object('error', 'invalid_grant'); end if;
  if c.used_at is not null then
    -- RFC 6749 4.1.2: a replayed code revokes what it issued
    if c.issued_token_id is not null then perform public.oauth__kill(c.issued_token_id); end if;
    return jsonb_build_object('error', 'invalid_grant');
  end if;
  if c.expires_at < v_now or c.client_id <> p_client_id or c.redirect_uri <> p_redirect_uri or c.code_challenge <> p_verifier_challenge then
    return jsonb_build_object('error', 'invalid_grant');
  end if;
  if not public.oauth__member_ok(c.member_id) then return jsonb_build_object('error', 'invalid_grant'); end if;
  if c.token_id is not null then
    update public.api_tokens set token_hash = p_access_hash, token_prefix = p_access_prefix, scopes = c.scopes, oauth_client_id = c.client_id,
           access_expires_at = v_now + make_interval(secs => p_access_ttl), rotated_at = v_now
     where id = c.token_id and member_id = c.member_id and not is_revoked
     returning id into v_tid;
    if v_tid is null then return jsonb_build_object('error', 'invalid_grant'); end if;
    update public.oauth_refresh_tokens set revoked_at = coalesce(revoked_at, v_now) where token_id = v_tid;
  else
    insert into public.api_tokens (member_id, name, agent_name, token_hash, token_prefix, scopes, oauth_client_id, access_expires_at, show_on_profile)
    values (c.member_id, c.agent_name, c.agent_name, p_access_hash, p_access_prefix, c.scopes, c.client_id, v_now + make_interval(secs => p_access_ttl), true)
    returning id into v_tid;
  end if;
  insert into public.oauth_refresh_tokens (token_hash, token_id, client_id, expires_at) values (p_refresh_hash, v_tid, c.client_id, v_now + make_interval(secs => p_refresh_ttl));
  update public.oauth_codes set used_at = v_now, issued_token_id = v_tid where code_hash = c.code_hash;
  update public.oauth_clients set last_used_at = v_now where client_id = c.client_id;
  return jsonb_build_object('tokenId', v_tid, 'scope', replace(c.scopes, ',', ' '), 'expiresIn', p_access_ttl);
end $$;
