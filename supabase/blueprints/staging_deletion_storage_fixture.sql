-- Disposable Staging fixture uploads only. Never install in Production.
BEGIN;
DO $guard$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM private.deletion_scheduler_target WHERE project_url='https://fhhudicklmpofuzkxeqe.supabase.co') THEN RAISE EXCEPTION 'staging_only'; END IF;
END $guard$;
CREATE POLICY deletion_certification_fixture_upload ON storage.objects FOR INSERT TO authenticated
 WITH CHECK(bucket_id LIKE 'deletion-certification-%' AND owner_id=auth.uid()::text
  AND auth.jwt()->'app_metadata'->>'deletion_certification_fixture'='true'
  AND private.account_is_active(auth.uid()));
COMMIT;
-- Teardown after certification: DROP POLICY deletion_certification_fixture_upload ON storage.objects;
