-- Read-only diagnostic, changes nothing. Tells us definitively whether
-- Postgres itself still thinks anon can execute this function, separate
-- from whatever PostgREST might be caching.
select
  has_function_privilege('anon', 'get_subscribers()', 'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated', 'get_subscribers()', 'EXECUTE') as authenticated_can_execute;
