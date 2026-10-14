-- Temporary Staging-only concurrency certification. Never install in Production.
BEGIN;
CREATE FUNCTION public.herkeys_certify_deletion_household_lock(p_account uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM private.deletion_scheduler_target WHERE project_url='https://fhhudicklmpofuzkxeqe.supabase.co')
  OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_account AND raw_app_meta_data->>'deletion_certification_fixture'='true') THEN RAISE EXCEPTION 'staging_fixture_only'; END IF;
 PERFORM private.deletion_has_other_household_owners(p_account);
 PERFORM pg_sleep(4);
END $fn$;
REVOKE ALL ON FUNCTION public.herkeys_certify_deletion_household_lock(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.herkeys_certify_deletion_household_lock(uuid) TO service_role;
COMMIT;
-- Required teardown: DROP FUNCTION public.herkeys_certify_deletion_household_lock(uuid);
