BEGIN;
-- Hold parent locks through classification and cleanup. Concurrent membership or
-- household-owned inserts must finish before classification or fail after purge.
DO $repair$
DECLARE definition text;body text;replacement text;
BEGIN
 SELECT pg_get_functiondef(oid),prosrc INTO definition,body
 FROM pg_proc WHERE oid='private.deletion_has_other_household_owners(uuid)'::regprocedure;
 IF position('FOR UPDATE' IN body)>0 OR position('BEGIN' IN body)=0 THEN RAISE EXCEPTION 'household_lock_contract_mismatch'; END IF;
 replacement:=overlay(body PLACING E'BEGIN\n PERFORM h.id FROM public.households h WHERE h.id IN (SELECT household_id FROM public.household_members WHERE profile_id=p_account) ORDER BY h.id FOR UPDATE;' FROM position('BEGIN' IN body) FOR 5);
 EXECUTE replace(definition,body,replacement);
END $repair$;
COMMIT;
