-- STAGING ONLY: fhhudicklmpofuzkxeqe. Approved pre-existing synthetic accounts.
-- No schema, policy, grant, entitlement or durable membership change.
-- All data/role/claim changes are contained in this transaction and rolled back.
BEGIN;
SET LOCAL statement_timeout = '10s';
SET LOCAL lock_timeout = '1s';
DO $probe$
DECLARE
  a constant uuid := '70a28225-f3ca-4c63-8e88-e65c09d07a3e';
  b constant uuid := 'be1aed55-6ede-4de4-b00e-b10d4fb21117';
  ha uuid; hb uuid; ca uuid; cb uuid;
  private_a uuid; shared_a uuid; private_b uuid;
  n integer; denied boolean;
  failure_column text; failure_constraint text;
  probe_case text := 'synthetic_fixture_guard';
  passed text[] := ARRAY[]::text[];
BEGIN
  IF (SELECT count(*) FROM auth.users WHERE
       (id=a AND raw_user_meta_data->>'hk_v2_cert'='20261017A') OR
       (id=b AND raw_user_meta_data->>'hk_v2_cert'='20261017B')) <> 2 THEN
    RAISE EXCEPTION 'synthetic_fixture_guard';
  END IF;
  IF EXISTS(SELECT 1 FROM public.tasks WHERE local_id LIKE 'codex-v2-isolation-20261113-%') OR
     EXISTS(SELECT 1 FROM public.household_members WHERE local_id='codex-v2-isolation-20261113-member') THEN
    RAISE EXCEPTION 'fixture_prefix_already_exists';
  END IF;
  SELECT household_id INTO STRICT ha FROM public.household_members WHERE profile_id=a AND role='owner';
  SELECT household_id INTO STRICT hb FROM public.household_members WHERE profile_id=b AND role='owner';
  IF ha=hb THEN RAISE EXCEPTION 'distinct_household_guard'; END IF;
  SELECT id INTO STRICT ca FROM public.household_categories WHERE household_id=ha AND scope='household' AND status='active' ORDER BY sort_order,id LIMIT 1;
  SELECT id INTO STRICT cb FROM public.household_categories WHERE household_id=hb AND scope='household' AND status='active' ORDER BY sort_order,id LIMIT 1;
  passed := array_append(passed,probe_case);

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
  probe_case := 'own_profile_read';
  IF (SELECT count(*) FROM public.profiles WHERE id=a)<>1 THEN RAISE EXCEPTION 'assertion'; END IF;
  passed := array_append(passed,probe_case);
  probe_case := 'unrelated_profile_denied';
  IF (SELECT count(*) FROM public.profiles WHERE id=b)<>0 THEN RAISE EXCEPTION 'assertion'; END IF;
  passed := array_append(passed,probe_case);

  probe_case := 'own_task_insert_and_read';
  INSERT INTO public.tasks(household_id,local_id,owner_profile_id,title,category_id,duration_minutes,commitment,plan_kind,status,scope,producer)
  VALUES(ha,'codex-v2-isolation-20261113-private-a',a,'Synthetic private probe',ca,10,'flexible','unplanned','open','personal','user-action') RETURNING id INTO private_a;
  IF (SELECT count(*) FROM public.tasks WHERE id=private_a)<>1 THEN RAISE EXCEPTION 'assertion'; END IF;
  INSERT INTO public.tasks(household_id,local_id,title,category_id,duration_minutes,commitment,plan_kind,status,scope,producer)
  VALUES(ha,'codex-v2-isolation-20261113-shared-a','Synthetic shared probe',ca,10,'flexible','unplanned','open','household','user-action') RETURNING id INTO shared_a;
  passed := array_append(passed,probe_case);
  probe_case := 'own_task_update';
  UPDATE public.tasks SET title='Synthetic private updated' WHERE id=private_a;
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>1 THEN RAISE EXCEPTION 'assertion'; END IF;
  passed := array_append(passed,probe_case);

  probe_case := 'unrelated_household_insert_denied'; denied:=false;
  BEGIN
    INSERT INTO public.tasks(household_id,local_id,owner_profile_id,title,category_id,duration_minutes,commitment,plan_kind,status,scope,producer)
    VALUES(hb,'codex-v2-isolation-20261113-forbidden',b,'Synthetic forbidden probe',cb,10,'flexible','unplanned','open','personal','user-action');
  EXCEPTION WHEN insufficient_privilege THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'assertion'; END IF;
  passed := array_append(passed,probe_case);

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated')::text,true);
  probe_case := 'unrelated_task_read_denied';
  IF (SELECT count(*) FROM public.tasks WHERE id IN(private_a,shared_a))<>0 THEN RAISE EXCEPTION 'assertion'; END IF;
  passed := array_append(passed,probe_case);
  probe_case := 'unrelated_task_update_denied';
  UPDATE public.tasks SET title='Synthetic forbidden edit' WHERE id=private_a;
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>0 THEN RAISE EXCEPTION 'assertion'; END IF;
  passed := array_append(passed,probe_case);

  -- Controlled temporary membership makes same-household privacy non-vacuous.
  EXECUTE 'RESET ROLE';
  INSERT INTO public.household_members(household_id,local_id,profile_id,member_type,role,scope)
  VALUES(ha,'codex-v2-isolation-20261113-member',b,'adult','member','personal');
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated')::text,true);
  probe_case := 'same_household_shared_read_allowed';
  IF (SELECT count(*) FROM public.tasks WHERE id=shared_a)<>1 THEN RAISE EXCEPTION 'assertion'; END IF;
  passed := array_append(passed,probe_case);
  probe_case := 'same_household_private_read_denied';
  IF (SELECT count(*) FROM public.tasks WHERE id=private_a)<>0 THEN RAISE EXCEPTION 'assertion'; END IF;
  passed := array_append(passed,probe_case);
  probe_case := 'member_own_private_insert_allowed';
  INSERT INTO public.tasks(household_id,local_id,owner_profile_id,title,category_id,duration_minutes,commitment,plan_kind,status,scope,producer)
  VALUES(ha,'codex-v2-isolation-20261113-private-b',b,'Synthetic member private probe',ca,10,'flexible','unplanned','open','personal','user-action') RETURNING id INTO private_b;
  IF (SELECT count(*) FROM public.tasks WHERE id=private_b)<>1 THEN RAISE EXCEPTION 'assertion'; END IF;
  passed := array_append(passed,probe_case);

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
  probe_case := 'household_owner_cannot_read_member_private';
  IF (SELECT count(*) FROM public.tasks WHERE id=private_b)<>0 THEN RAISE EXCEPTION 'assertion'; END IF;
  passed := array_append(passed,probe_case);
  probe_case := 'actor_switch_back_preserves_owner_data';
  IF (SELECT count(*) FROM public.tasks WHERE id=private_a AND title='Synthetic private updated' AND owner_profile_id=a)<>1 THEN RAISE EXCEPTION 'assertion'; END IF;
  passed := array_append(passed,probe_case);
  probe_case := 'private_owner_reassignment_denied'; denied:=false;
  BEGIN
    UPDATE public.tasks SET owner_profile_id=b WHERE id=private_a;
  EXCEPTION WHEN insufficient_privilege THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'assertion'; END IF;
  passed := array_append(passed,probe_case);

  PERFORM set_config('request.jwt.claims','{}',true);
  probe_case := 'missing_identity_cannot_read';
  IF (SELECT count(*) FROM public.tasks WHERE id IN(private_a,private_b,shared_a))<>0 THEN RAISE EXCEPTION 'assertion'; END IF;
  passed := array_append(passed,probe_case);
  EXECUTE 'RESET ROLE';
  EXECUTE 'SET LOCAL ROLE anon';
  probe_case := 'anonymous_privilege_denied'; denied:=false;
  BEGIN
    PERFORM 1 FROM public.tasks WHERE id=shared_a;
  EXCEPTION WHEN insufficient_privilege THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'assertion'; END IF;
  passed := array_append(passed,probe_case);
  EXECUTE 'RESET ROLE';
  PERFORM set_config('herkeys.codex_isolation_result',jsonb_build_object('status','PASS','checks',cardinality(passed),'passed',passed,'rollback_requested',true)::text,true);
EXCEPTION WHEN OTHERS THEN
  -- Unexpected errors are FAIL, never counted as authorization denials. The
  -- exception subtransaction reverts its writes; the outer rollback still runs.
  GET STACKED DIAGNOSTICS failure_column=COLUMN_NAME,failure_constraint=CONSTRAINT_NAME;
  PERFORM set_config('herkeys.codex_isolation_result',jsonb_build_object('status','FAIL','at',probe_case,'sqlstate',SQLSTATE,'column',failure_column,'constraint',failure_constraint,'checks_completed',cardinality(passed),'rollback_requested',true)::text,true);
END
$probe$;
SELECT current_setting('herkeys.codex_isolation_result')::jsonb AS isolation_result;
ROLLBACK;
