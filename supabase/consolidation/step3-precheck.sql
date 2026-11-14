-- Consolidation Step 3, read-only pre-check. Changes nothing. Run it first and send me the result.
-- Lists everything in "public" that is NOT one of the 28 plain tables, because those need a decision before the move.

select 'function' as kind, p.proname as name, pg_get_function_identity_arguments(p.oid) as detail
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
union all
select 'view', c.relname, '' from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('v', 'm')
union all
select 'sequence', c.relname, '' from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'S'
union all
select 'trigger', t.tgname, c.relname from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and not t.tgisinternal
union all
select 'type', t.typname, '' from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typtype in ('e', 'd')
order by 1, 2;
