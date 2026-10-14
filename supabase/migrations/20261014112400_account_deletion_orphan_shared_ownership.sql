BEGIN;
-- Membership is not the only ownership evidence. Retained private records must
-- protect another adult even if an earlier membership was removed.
CREATE FUNCTION private.deletion_has_other_household_owners(p_account uuid) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE resource record;other_owner boolean;
BEGIN
 IF EXISTS(SELECT 1 FROM public.household_members a JOIN public.household_members b USING(household_id)
  WHERE a.profile_id=p_account AND b.profile_id<>p_account) THEN RETURN true; END IF;
 FOR resource IN SELECT * FROM private.deletion_resource_registry WHERE household_scoped LOOP
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I data JOIN public.household_members membership ON membership.household_id=data.household_id WHERE membership.profile_id=$1 AND data.%I IS NOT NULL AND data.%I<>$1)',
   resource.table_name,resource.owner_column,resource.owner_column) INTO other_owner USING p_account;
  IF other_owner THEN RETURN true; END IF;
 END LOOP;
 RETURN false;
END $fn$;
REVOKE ALL ON FUNCTION private.deletion_has_other_household_owners(uuid) FROM PUBLIC,anon,authenticated,service_role;
DO $repair$
DECLARE definition text;original text;
BEGIN
 SELECT replace(pg_get_functiondef('public.herkeys_deletion_command(text,jsonb)'::regprocedure),E'\r\n',E'\n') INTO definition;
 original:=$old$IF EXISTS(SELECT 1 FROM public.household_members a JOIN public.household_members b USING(household_id)
    WHERE a.profile_id=r.account_id AND b.profile_id<>r.account_id) THEN$old$;
 IF position(original IN definition)=0 THEN RAISE EXCEPTION 'shared_ownership_contract_mismatch'; END IF;
 EXECUTE replace(definition,original,'IF private.deletion_has_other_household_owners(r.account_id) THEN');
END $repair$;
COMMIT;
