-- Her Keys schema fingerprint - the single source of truth for what "same schema" means.
--
-- One row per normalized catalog fact for the Her Keys application schemas
-- (public and private). It is a plain SELECT, so it is read-only by
-- construction and can be run by psql, `supabase db query`, or the Supabase MCP.
--
-- Do not run this file directly for parity. Use schema-fingerprint.mjs, which
-- wraps it (pinning search_path and hashing each dimension) so every
-- environment is measured identically. See README.md.
--
-- Determinism rules baked in here:
--   * No oids and no environment-specific names leak into a line.
--   * Deparsed text (constraints, indexes, triggers, policies) is only stable when
--     search_path is pinned to '' by the wrapper, which makes everything schema-qualified.
--   * Function bodies are compared by md5 of pg_get_functiondef so a body change is
--     detected without printing bodies.
--   * Lines are ordered and hashed with COLLATE "C" by the wrapper so a database's
--     default collation can never change a digest.
--
-- Dimensions named info.* are recorded but are NOT part of the gating digest,
-- because they are hosted-vs-local platform facts rather than Her Keys objects.
-- Every other dimension gates parity. Privileges are deliberately in the gating
-- set: they are part of the Her Keys security contract.

with app_ns as (
  select oid, nspname
  from pg_namespace
  where nspname in ('public', 'private')
),
rels as (
  select c.oid, n.nspname, c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity,
         c.relowner, c.reloptions, c.relpersistence, c.relacl
  from pg_class c
  join app_ns n on n.oid = c.relnamespace
  where c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
),
procs as (
  select p.oid, n.nspname, p.proname, p.proowner, p.proacl, p.prokind, p.prosecdef,
         p.provolatile, p.proleakproof, p.proisstrict, p.proparallel, p.proconfig, p.prolang
  from pg_proc p
  join app_ns n on n.oid = p.pronamespace
  where p.prokind in ('f', 'p')
),
roles_of_interest as (
  select oid, rolname
  from pg_roles
  where rolname in ('anon', 'authenticated', 'service_role')
),
lines as (

  -- schemas ---------------------------------------------------------------
  select 'schemas'::text as dimension,
         format('%s|owner=%s', nspname, pg_get_userbyid(nspowner)) as line
  from pg_namespace
  where nspname in ('public', 'private')

  union all
  -- relations (tables, views, sequences) incl. RLS flags ---------------------
  select 'relations',
         format('%s.%s|kind=%s|rls=%s|force_rls=%s|owner=%s|persistence=%s|options=%s',
                nspname, relname, relkind, relrowsecurity, relforcerowsecurity,
                pg_get_userbyid(relowner), relpersistence, coalesce(reloptions::text, ''))
  from rels

  union all
  -- columns: name, type, nullability, default, generated/identity ------------
  select 'columns',
         format('%s.%s|%s|%s|%s|notnull=%s|default=%s|generated=%s|identity=%s',
                r.nspname, r.relname,
                row_number() over (partition by r.oid order by a.attnum),
                a.attname, format_type(a.atttypid, a.atttypmod), a.attnotnull,
                coalesce(pg_get_expr(d.adbin, d.adrelid), ''), a.attgenerated, a.attidentity)
  from rels r
  join pg_attribute a on a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where r.relkind in ('r', 'p', 'v', 'm', 'f')

  union all
  -- constraints: pk / unique / fk / check / exclusion ------------------------
  select 'constraints',
         format('%s.%s|%s|type=%s|%s|validated=%s|deferrable=%s|deferred=%s',
                r.nspname, r.relname, k.conname, k.contype, pg_get_constraintdef(k.oid),
                k.convalidated, k.condeferrable, k.condeferred)
  from pg_constraint k
  join rels r on r.oid = k.conrelid

  union all
  -- indexes ------------------------------------------------------------------
  select 'indexes',
         format('%s.%s|%s|unique=%s|primary=%s|valid=%s|%s',
                r.nspname, r.relname, i.relname, x.indisunique, x.indisprimary, x.indisvalid,
                pg_get_indexdef(x.indexrelid))
  from pg_index x
  join pg_class i on i.oid = x.indexrelid
  join rels r on r.oid = x.indrelid

  union all
  -- triggers (user triggers only; internal FK triggers excluded) -----------------
  select 'triggers',
         format('%s.%s|%s|enabled=%s|%s',
                r.nspname, r.relname, t.tgname, t.tgenabled, pg_get_triggerdef(t.oid))
  from pg_trigger t
  join rels r on r.oid = t.tgrelid
  where not t.tgisinternal

  union all
  -- functions: signature, security mode, search_path config, body digest ---------
  select 'functions',
         format('%s.%s(%s)|returns=%s|lang=%s|kind=%s|secdef=%s|volatility=%s|leakproof=%s|strict=%s|parallel=%s|config=%s|owner=%s|body_md5=%s',
                p.nspname, p.proname, pg_get_function_identity_arguments(p.oid),
                pg_get_function_result(p.oid), l.lanname, p.prokind, p.prosecdef,
                p.provolatile, p.proleakproof, p.proisstrict, p.proparallel,
                coalesce(p.proconfig::text, ''), pg_get_userbyid(p.proowner),
                md5(pg_get_functiondef(p.oid)))
  from procs p
  join pg_language l on l.oid = p.prolang

  union all
  -- RLS policies -----------------------------------------------------------------
  select 'policies',
         format('%s.%s|%s|permissive=%s|roles=%s|cmd=%s|using=%s|check=%s',
                schemaname, tablename, policyname, permissive, roles::text, cmd,
                coalesce(qual, ''), coalesce(with_check, ''))
  from pg_policies
  where schemaname in ('public', 'private')

  union all
  -- user-defined types (enums, domains, standalone composites) ------------------------
  select 'types',
         format('%s.%s|type=%s', n.nspname, t.typname, t.typtype)
  from pg_type t
  join app_ns n on n.oid = t.typnamespace
  where t.typtype in ('e', 'd')
     or (t.typtype = 'c' and exists (select 1 from pg_class c where c.oid = t.typrelid and c.relkind = 'c'))

  union all
  -- explicit ACLs: relations (defaults expanded so an unset ACL is still visible) --------
  select 'privileges.relations',
         format('%s.%s|grantee=%s|%s|grantable=%s',
                r.nspname, r.relname,
                case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
                a.privilege_type, a.is_grantable)
  from rels r
  cross join lateral aclexplode(
    coalesce(r.relacl, acldefault(case when r.relkind = 'S' then 'S'::"char" else 'r'::"char" end, r.relowner))
  ) a

  union all
  -- explicit ACLs: columns (only where a column-level grant exists) ---------------------
  select 'privileges.columns',
         format('%s.%s.%s|grantee=%s|%s|grantable=%s',
                r.nspname, r.relname, at.attname,
                case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
                a.privilege_type, a.is_grantable)
  from rels r
  join pg_attribute at on at.attrelid = r.oid and at.attnum > 0 and not at.attisdropped and at.attacl is not null
  cross join lateral aclexplode(at.attacl) a

  union all
  -- explicit ACLs: functions (an unset ACL expands to PUBLIC EXECUTE, which matters) ------
  select 'privileges.functions',
         format('%s.%s(%s)|grantee=%s|%s|grantable=%s',
                p.nspname, p.proname, pg_get_function_identity_arguments(p.oid),
                case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
                a.privilege_type, a.is_grantable)
  from procs p
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f'::"char", p.proowner))) a

  union all
  -- explicit ACLs: schemas ------------------------------------------------------------------
  select 'privileges.schemas',
         format('%s|grantee=%s|%s|grantable=%s',
                n.nspname,
                case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
                a.privilege_type, a.is_grantable)
  from pg_namespace n
  cross join lateral aclexplode(coalesce(n.nspacl, acldefault('n'::"char", n.nspowner))) a
  where n.nspname in ('public', 'private')

  union all
  -- default privileges that future objects in these schemas will inherit -----------------------
  select 'privileges.default_acl',
         format('owner=%s|schema=%s|objtype=%s|acl=%s',
                pg_get_userbyid(d.defaclrole),
                case when d.defaclnamespace = 0 then '<global>' else d.defaclnamespace::regnamespace::text end,
                d.defaclobjtype, d.defaclacl::text)
  from pg_default_acl d
  where d.defaclnamespace = 0 or d.defaclnamespace in (select oid from app_ns)

  union all
  -- EFFECTIVE privileges the API roles (and PUBLIC) actually hold: relations ---------------------
  select 'privileges.effective',
         format('%s|relation|%s.%s|%s', ro.role_name, r.nspname, r.relname, pr.priv)
  from rels r
  cross join (
    select rolname as role_name from roles_of_interest
    union all select 'public'
  ) ro
  cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) pr(priv)
  where r.relkind in ('r', 'p', 'v', 'm')
    and has_table_privilege(ro.role_name, r.oid, pr.priv)

  union all
  -- EFFECTIVE privileges: functions --------------------------------------------------------------
  select 'privileges.effective',
         format('%s|function|%s.%s(%s)|EXECUTE', ro.role_name, p.nspname, p.proname,
                pg_get_function_identity_arguments(p.oid))
  from procs p
  cross join (
    select rolname as role_name from roles_of_interest
    union all select 'public'
  ) ro
  where has_function_privilege(ro.role_name, p.oid, 'EXECUTE')

  union all
  -- EFFECTIVE privileges: schemas ------------------------------------------------------------------
  select 'privileges.effective',
         format('%s|schema|%s|%s', ro.role_name, n.nspname, pr.priv)
  from app_ns n
  cross join (
    select rolname as role_name from roles_of_interest
    union all select 'public'
  ) ro
  cross join (values ('USAGE'), ('CREATE')) pr(priv)
  where has_schema_privilege(ro.role_name, n.oid, pr.priv)

  union all
  -- EFFECTIVE privileges: sequences (none today; present so a future one cannot slip past) ------------
  select 'privileges.effective',
         format('%s|sequence|%s.%s|%s', ro.role_name, r.nspname, r.relname, pr.priv)
  from rels r
  cross join (
    select rolname as role_name from roles_of_interest
    union all select 'public'
  ) ro
  cross join (values ('USAGE'), ('SELECT'), ('UPDATE')) pr(priv)
  where r.relkind = 'S'
    and has_sequence_privilege(ro.role_name, r.oid, pr.priv)

  union all
  -- informational only: platform facts that legitimately differ hosted vs local ---------------------------
  select 'info.extensions',
         format('%s|%s|schema=%s', e.extname, e.extversion, n.nspname)
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace

  union all
  select 'info.event_triggers',
         format('%s|%s|fn=%s.%s|enabled=%s', et.evtname, et.evtevent, fn.nspname, pr.proname, et.evtenabled)
  from pg_event_trigger et
  join pg_proc pr on pr.oid = et.evtfoid
  join pg_namespace fn on fn.oid = pr.pronamespace
)
select dimension, line from lines
