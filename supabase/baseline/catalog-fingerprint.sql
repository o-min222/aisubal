-- A149: read-only fingerprint of the app schema, run on prod and on a fresh DB built from the baseline.
-- One row per object: (kind, key, val). Identical row sets = same functions, grants, policies, indexes,
-- constraints, columns, triggers, RLS flags, views, sequences, default privileges, buckets, cron jobs.
set search_path to pg_catalog;
with
ns as (select oid, nspname from pg_namespace where nspname in ('public','anon_private')),
rel as (
  select c.*, n.nspname, format('%I.%I', n.nspname, c.relname) q
  from pg_class c join ns n on n.oid = c.relnamespace
  where c.relkind in ('r','p','v','m','S') and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
),
fn as (
  select p.*, p.oid::regprocedure::text sig from pg_proc p join ns n on n.oid = p.pronamespace
  where p.prokind in ('f','p') and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
)
select kind, key, val from (
  select 'col' kind, r.q || '.' || a.attname key,
    concat_ws(' | ', format_type(a.atttypid, a.atttypmod), a.attnotnull, a.attidentity, a.attgenerated, pg_get_expr(ad.adbin, ad.adrelid)) val
  from rel r join pg_attribute a on a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped
  left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
  where r.relkind in ('r','p','v','m')
  union all
  select 'con', r.q || '.' || co.conname, pg_get_constraintdef(co.oid) from rel r join pg_constraint co on co.conrelid = r.oid where co.contype <> 'n' -- PG18 lists NOT NULL here; columns carry it
  union all
  select 'idx', r.q || '.' || ic.relname, pg_get_indexdef(i.indexrelid) from rel r join pg_index i on i.indrelid = r.oid join pg_class ic on ic.oid = i.indexrelid
  union all
  select 'fn', f.sig, md5(pg_get_functiondef(f.oid)) from fn f
  union all
  select 'fn_acl', f.sig, (select string_agg(x_item, ',' order by x_item) from (select case when x.grantee = 0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end || ':' || x.privilege_type x_item
     from aclexplode(coalesce(f.proacl, acldefault('f'::"char", f.proowner))) x where x.grantee <> f.proowner) s) from fn f
  union all
  select 'rel_acl', r.q, (select string_agg(x_item, ',' order by x_item) from (select case when x.grantee = 0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end || ':' || x.privilege_type || case when x.is_grantable then '*' else '' end x_item
     from aclexplode(coalesce(r.relacl, acldefault((case when r.relkind = 'S' then 's' else 'r' end)::"char", r.relowner))) x where x.grantee <> r.relowner) s) from rel r
  union all
  select 'col_acl', r.q || '.' || a.attname, (select string_agg(x_item, ',' order by x_item) from (select pg_get_userbyid(x.grantee) || ':' || x.privilege_type x_item from aclexplode(a.attacl) x) s)
  from rel r join pg_attribute a on a.attrelid = r.oid where a.attacl is not null and not a.attisdropped
  union all
  select 'pol', format('%I.%I.%I', n.nspname, c.relname, p.polname),
    concat_ws(' | ', p.polcmd, p.polpermissive, (select string_agg(x_item, ',' order by x_item) from (select case when o = 0 then 'PUBLIC' else pg_get_userbyid(o) end x_item from unnest(p.polroles) o) s),
      pg_get_expr(p.polqual, p.polrelid), pg_get_expr(p.polwithcheck, p.polrelid))
  from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('public','anon_private','storage')
  union all
  select 'trg', format('%I.%I.%I', n.nspname, c.relname, t.tgname), pg_get_triggerdef(t.oid) || ' ' || t.tgenabled::text
  from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
  where not t.tgisinternal and (n.nspname in ('public','anon_private') or (n.nspname = 'auth' and c.relname = 'users'))
  union all
  select 'rls', r.q, r.relrowsecurity || ' ' || r.relforcerowsecurity from rel r where r.relkind in ('r','p')
  union all
  select 'view', r.q, md5(pg_get_viewdef(r.oid)) from rel r where r.relkind in ('v','m')
  union all
  select 'seq', r.q, concat_ws(' ', format_type(s.seqtypid, null), s.seqincrement, s.seqmin, s.seqmax, s.seqcache, s.seqcycle) from rel r join pg_sequence s on s.seqrelid = r.oid
  union all
  select 'defacl', d.defaclobjtype::text, (select string_agg(x_item, ',' order by x_item) from (select pg_get_userbyid(x.grantee) || ':' || x.privilege_type x_item from aclexplode(d.defaclacl) x) s)
  from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace where n.nspname = 'public' and pg_get_userbyid(d.defaclrole) = 'postgres'
  union all
  select 'nsp_acl', n.nspname, (select string_agg(x_item, ',' order by x_item) from (select case when x.grantee = 0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end || ':' || x.privilege_type x_item from aclexplode(sn.nspacl) x where x.grantee <> sn.nspowner) s)
  from ns n join pg_namespace sn on sn.oid = n.oid where n.nspname = 'anon_private'
  union all
  select 'comment', coalesce(c.relname, p.proname, '?') || '.' || de.objsubid, md5(de.description)
  from pg_description de left join pg_class c on de.classoid = 'pg_class'::regclass and c.oid = de.objoid
  left join pg_proc p on de.classoid = 'pg_proc'::regclass and p.oid = de.objoid
  where coalesce(c.relnamespace, p.pronamespace) in (select oid from ns)
  union all
  select 'bucket', b.id, concat_ws(' | ', b.name, b.public, b.file_size_limit, b.allowed_mime_types::text) from storage.buckets b
  union all
  select 'cron', j.jobname, j.schedule || ' | ' || j.command from cron.job j
) f
order by kind, key;
