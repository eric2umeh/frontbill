-- Cut Supabase Logs Ingest from Postgres statement / duration noise.
-- App-side poll reductions land in the same PR; this script is the DB lever
-- recommended by Supabase (log_statement, log_min_duration_statement, pgaudit).
--
-- Run in Supabase SQL Editor on **staging first**, then production after deploy.
-- Safe to re-run. Does not require a DB restart for these role-level settings.
--
-- Also turn off connection logging via CLI if it is still on (system setting):
--   supabase postgres-config update --experimental --remote=<project-ref> \
--     --config log_connections=false --config log_disconnections=false
--
-- Docs: https://supabase.com/docs/guides/platform/manage-your-usage/logs-ingest

-- Inspect current values (optional)
-- select name, setting, source from pg_settings
-- where name in (
--   'log_statement', 'log_min_duration_statement', 'log_min_messages',
--   'log_connections', 'log_disconnections', 'log_temp_files', 'log_lock_waits'
-- );

-- Do not log every SQL statement (largest Postgres ingest lever for busy APIs).
alter role authenticator set log_statement to 'none';
alter role authenticated set log_statement to 'none';
alter role service_role set log_statement to 'none';
alter role postgres set log_statement to 'none';

-- Only log statements that run ≥ 2s (was often 0 / a few ms while tuning).
alter role authenticator set log_min_duration_statement to '2000';
alter role authenticated set log_min_duration_statement to '2000';
alter role service_role set log_min_duration_statement to '2000';
alter role postgres set log_min_duration_statement to '2000';

-- Keep Postgres internal chatter at warning (not debug).
alter role authenticator set log_min_messages to 'warning';
alter role authenticated set log_min_messages to 'warning';
alter role service_role set log_min_messages to 'warning';
alter role postgres set log_min_messages to 'warning';

-- Quiet lock / temp-file noise unless actively diagnosing.
alter role authenticator set log_lock_waits to 'off';
alter role authenticated set log_lock_waits to 'off';
alter role service_role set log_lock_waits to 'off';
alter role postgres set log_lock_waits to 'off';

alter role authenticator set log_temp_files to '-1';
alter role authenticated set log_temp_files to '-1';
alter role service_role set log_temp_files to '-1';
alter role postgres set log_temp_files to '-1';

-- If pgaudit was enabled broadly, turn it off (very verbose).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pgaudit') then
    execute 'alter role authenticator set pgaudit.log to ''none''';
    execute 'alter role authenticated set pgaudit.log to ''none''';
    execute 'alter role service_role set pgaudit.log to ''none''';
    execute 'alter role postgres set pgaudit.log to ''none''';
  end if;
end $$;

-- Verify role overrides
select rolname, rolconfig
from pg_roles
where rolname in ('authenticator', 'authenticated', 'service_role', 'postgres')
order by rolname;
