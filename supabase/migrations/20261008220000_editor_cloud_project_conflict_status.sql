BEGIN;

-- Application version conflicts must return once with HTTP 409. SQLSTATE
-- 40001 asks PostgREST to retry a transaction and can loop on older gateways.
-- Preserve the seven reviewed function bodies and all existing privileges.
DO $migration$
DECLARE target record; before_row pg_proc; after_row pg_proc; function_oid oid;
BEGIN
  FOR target IN SELECT * FROM (VALUES
    ('public.editor_cloud_edit_save(text,uuid,jsonb,integer,uuid)', 'e2e64ab6704646ed78404ad70abc03e7', '2b1554e5367eb4477b14b172eebab675'),
    ('public.editor_cloud_review_accept(text,uuid,integer)', '9ac83066a04e67e67c9b1c98b056857d', '6c87abf8a3248739adf56facff6dd6ae'),
    ('public.editor_cloud_review_leave(text,uuid,integer)', 'c6cf9de22531681217c92e28a4201db8', 'ab6e5ed29052993202e013fa92819198'),
    ('public.editor_cloud_review_resolve(text,uuid,uuid,integer,boolean)', '67d145ae4e20c17f574479f138b3bd17', 'db1be8d46c315a15dac26833fee6f75e'),
    ('public.editor_cloud_review_share(uuid,text,text,integer)', 'c397d873d735999ce2a1103b1361ee7d', '3f481d2560a040d57114396c554a6a2e'),
    ('public.editor_cloud_save(uuid,jsonb,integer,uuid)', 'e44c05a380a14e42d38a22eca8dc796c', 'f3844b143297845dae323c5d2dd2c474'),
    ('public.editor_cloud_set_trash(uuid,integer,integer,boolean)', '0a5e6585b07cff9fbe89e5e5fe5c2c4d', 'b3c43eff53048054a52093a888d5567c')
  ) AS functions(identity, before_md5, after_md5) LOOP
    function_oid:=to_regprocedure(target.identity);
    SELECT * INTO before_row FROM pg_proc WHERE oid=function_oid;
    IF NOT FOUND OR md5(before_row.prosrc) NOT IN (target.before_md5,target.after_md5) THEN
      RAISE EXCEPTION 'Reconcile changed editor cloud function before updating conflicts: %',target.identity;
    END IF;
    IF md5(before_row.prosrc)=target.before_md5 THEN
      EXECUTE replace(pg_get_functiondef(function_oid),'''40001''','''PT409''');
    END IF;
    SELECT * INTO after_row FROM pg_proc WHERE oid=function_oid;
    IF md5(after_row.prosrc)<>target.after_md5 OR
       (after_row.proowner,after_row.proacl,after_row.prosecdef,after_row.proconfig)
       IS DISTINCT FROM (before_row.proowner,before_row.proacl,before_row.prosecdef,before_row.proconfig) THEN
      RAISE EXCEPTION 'Editor cloud function changed beyond conflict status: %',target.identity;
    END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname LIKE 'editor_cloud_%' AND p.prosrc LIKE '%40001%') THEN
    RAISE EXCEPTION 'An editor cloud application conflict still uses a retryable SQLSTATE';
  END IF;
END $migration$;

NOTIFY pgrst, 'reload schema';
COMMIT;
