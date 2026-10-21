BEGIN;
-- A private account-owned receipt can still reference a shared household.
-- Its deletion action and its evidence of another adult's ownership are
-- separate decisions. Never cascade it away after that adult leaves membership.
DO $repair$
DECLARE definition text;original text;
BEGIN
 SELECT pg_get_functiondef('private.deletion_has_other_household_owners(uuid)'::regprocedure) INTO definition;
 original:='FROM private.deletion_resource_registry WHERE household_scoped LOOP';
 IF position(original IN definition)=0 THEN RAISE EXCEPTION 'private_household_ownership_contract_mismatch'; END IF;
 EXECUTE replace(definition,original,$new$FROM private.deletion_resource_registry r WHERE household_scoped OR EXISTS(
  SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=r.table_name AND c.column_name='household_id') LOOP$new$);
END $repair$;
COMMIT;
