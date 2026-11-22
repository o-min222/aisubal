// @ts-nocheck — loosely typed SQL harness
// @vitest-environment node
/**
 * Runs migration 0032 on an in-memory Postgres (PGlite + btree_gist) over a minimal stub of
 * members/auth, then walks the policy: free first handle, 2 changes / 14 days, 14-day hold,
 * switch-back counts, trigger + RLS + exclusion constraint, old-handle redirect.
 */
import { describe, it, expect as vexpect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
/* eslint-disable @typescript-eslint/no-explicit-any */
let db: any
const ex = (s: string) => db.exec(s)
const failures: string[] = []
function expect(name: string, cond: unknown, info?: unknown) { if (!cond) failures.push(name + ' ' + JSON.stringify(info)) }

describe('0032 handle policy (database)', () => {
  it('enforces the policy end to end', async () => {
    db = new PGlite({ extensions: { btree_gist } })
    
    await ex(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA extensions; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    CREATE TABLE public.members (id uuid primary key default gen_random_uuid(), auth_id uuid unique, handle text, display_name text, bio text, avatar_url text,
      show_real_name boolean default false, public_real_name text, profile_completed_at timestamptz, signup_completed_at timestamptz default now(),
      is_banned boolean default false, is_admin boolean default false, updated_at timestamptz);
    CREATE UNIQUE INDEX members_handle_key ON public.members(handle) WHERE handle IS NOT NULL;
    CREATE TABLE public.member_private (member_id uuid primary key references public.members(id), real_name text, google_avatar_url text);
    CREATE FUNCTION public.app__me() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT id FROM public.members WHERE auth_id = auth.uid() $$;
    CREATE FUNCTION public.app__is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS(SELECT 1 FROM public.members WHERE auth_id = auth.uid() AND is_admin) $$;
    GRANT USAGE ON SCHEMA public TO authenticated;
    `)
    await ex(fs.readFileSync(path.join(process.cwd(),'supabase/migrations/0032_handle_policy.sql'),'utf8'))
    const A='00000000-0000-0000-0000-00000000000a', B='00000000-0000-0000-0000-00000000000b', ADM='00000000-0000-0000-0000-0000000000ad'
    await ex(`INSERT INTO public.members(auth_id, display_name) VALUES ('${A}','에이'),('${B}','비'); INSERT INTO public.members(auth_id, display_name, handle, is_admin) VALUES ('${ADM}','관리','boss', true);`)
    
    async function as(uid, sql, params=[]) {
      await ex(`SET test.uid = '${uid}'; SET ROLE authenticated;`)
      try { const r = await db.query(sql, params); return { ok: true, rows: r.rows } }
      catch (e) { return { ok: false, err: e.message, detail: e.detail } }
      finally { await ex('RESET ROLE') }
    }
    
    const save = (uid,h) => as(uid, `SELECT public.profile_save($1::jsonb) r`, [JSON.stringify({handle:h, display_name:'이름이름', bio:'', avatar:'keep', show_real_name:false})])
    const change = (uid,h) => as(uid, `SELECT public.profile_change_handle($1) r`, [h])
    const status = async (uid,h=null) => (await as(uid, `SELECT public.profile_handle_status($1) r`, [h])).rows?.[0]?.r
    
    let r: any = await save(A,'alpha')    ; expect('onboarding first handle is free', r.ok, r)
    let s = await status(A); expect('first handle not counted', s.quota.remaining===2 && s.history.length===0, s)
    r = await save(B,'admin'); expect('reserved handle blocked', !r.ok && /profile_handle_invalid/.test(r.err), r)
    r = await save(B,'alpha'); expect('taken handle blocked', !r.ok && /handle_taken/.test(r.err), r)
    r = await save(B,'bravo'); expect('B onboarding', r.ok, r)
    r = await change(A,'alpha2'); expect('change 1', r.ok && r.rows[0].r.quota.remaining===1, r)
    s = await status(B,'alpha'); expect('old handle on hold for others (status)', s.check.state==='on_hold' && s.check.heldUntil===null, s)
    r = await change(B,'alpha'); expect('others cannot take a held handle', !r.ok && /handle_on_hold/.test(r.err), r)
    r = await save(B,'alpha'); expect('profile_save path also blocked by hold', !r.ok && /handle_on_hold/.test(r.err), r)
    s = await status(A,'alpha'); expect('owner sees own_hold with heldUntil', s.check.state==='own_hold' && s.check.heldUntil, s)
    r = await change(A,'alpha'); expect('owner switches back (change 2)', r.ok && r.rows[0].r.quota.remaining===0 && r.rows[0].r.current==='alpha', r)
    r = await change(A,'alpha3'); expect('3rd change in 14 days → cooldown with next date', !r.ok && /handle_change_cooldown/.test(r.err) && r.detail, r)
    r = await save(A,'alpha3'); expect('cooldown also via profile_save', !r.ok && /handle_change_cooldown/.test(r.err), r)
    r = await as(A, `UPDATE public.members SET handle='zzz_direct' WHERE auth_id='${A}'`); expect('no direct update (no privilege)', !r.ok, r)
    await ex(`SET test.uid=''`); r = await db.query(`UPDATE public.members SET handle='zzz_direct' WHERE auth_id='${A}'`).then(()=>({ok:true}),e=>({ok:false,err:e.message}))
    expect('trigger blocks a handle change outside the policy fn (even as owner role)', !r.ok && /handle_change_use_rpc/.test(r.err), r)
    let h = (await as(A, `SELECT old_handle,new_handle FROM public.handle_history ORDER BY id`)).rows
    expect('member sees own history', h.length===2, h)
    h = (await as(B, `SELECT * FROM public.handle_history`)).rows
    expect('other member sees none', h.length===0, h)
    h = (await as(ADM, `SELECT * FROM public.handle_history`)).rows
    expect('admin sees all', h.length===2, h)
    r = await as(A, `INSERT INTO public.handle_history(member_id,old_handle,new_handle,released_at) SELECT id,'x_x','y_y',now() FROM public.members LIMIT 1`)
    expect('no direct history insert', !r.ok, r)
    // redirect: alpha2 held by A (A moved back to alpha → alpha2 held)
    r = await as(B, `SELECT public.member_id_by_old_handle('alpha2') id`); const aId=(await db.query(`SELECT id FROM public.members WHERE auth_id='${A}'`)).rows[0].id
    expect('old handle resolves during hold', r.rows[0].id===aId, r)
    // time travel 15 days
    await ex(`UPDATE public.handle_history SET changed_at = changed_at - interval '15 days', released_at = released_at - interval '15 days'`)
    s = await status(A); expect('quota refills after 14 days', s.quota.remaining===2, s)
    r = await as(B, `SELECT public.member_id_by_old_handle('alpha2') id`); expect('released + unclaimed → still redirects', r.rows[0].id===aId, r)
    r = await change(B,'alpha2'); expect('released handle claimable by anyone', r.ok, r)
    r = await as(B, `SELECT public.member_id_by_old_handle('alpha2') id`); expect('claimed → no redirect', r.rows[0].id===null, r)
    r = await as(B, `SELECT public.profile_handle_available('alpha') ok`); expect('available() false for current', r.rows[0].ok===false, r)
    // race-ish: overlapping hold impossible
    r = await db.query(`INSERT INTO public.handle_history(member_id,old_handle,new_handle,changed_at,released_at) SELECT id,'dup','dup2',now(),now()+interval '1 day' FROM public.members LIMIT 2`).then(()=>({ok:true}),e=>({ok:false,err:e.message}))
    expect('exclusion constraint: one hold per handle at a time', !r.ok && /handle_history_one_hold/.test(r.err), r)
    
    vexpect(failures).toEqual([])
  }, 60_000)
})
