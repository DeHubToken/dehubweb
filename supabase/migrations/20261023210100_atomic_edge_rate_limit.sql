CREATE OR REPLACE FUNCTION public.consume_edge_rate_limit(p_bucket_key text,p_action_type text,p_limit integer,p_window_ms bigint)
RETURNS TABLE(allowed boolean,remaining integer,reset_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_count integer; v_start timestamptz; v_now timestamptz:=clock_timestamp();
  v_window interval:=make_interval(secs=>p_window_ms/1000.0);
BEGIN
  IF p_limit IS NULL OR p_limit<1 OR p_limit>=2147483647 OR p_window_ms IS NULL OR p_window_ms<1 OR p_bucket_key IS NULL OR p_action_type IS NULL THEN
    RAISE EXCEPTION 'Invalid rate limit configuration';
  END IF;
  INSERT INTO public.edge_rate_limits AS r(bucket_key,action_type,count,window_start)
  VALUES(p_bucket_key,p_action_type,1,v_now)
  ON CONFLICT(bucket_key,action_type) DO UPDATE SET
    count=CASE WHEN r.window_start<=v_now-v_window THEN 1 ELSE least(r.count::bigint+1,p_limit::bigint+1)::integer END,
    window_start=CASE WHEN r.window_start<=v_now-v_window THEN v_now ELSE r.window_start END
  RETURNING r.count,r.window_start INTO v_count,v_start;
  RETURN QUERY SELECT v_count<=p_limit,greatest(p_limit-v_count,0),v_start+v_window;
END $$;
REVOKE ALL ON FUNCTION public.consume_edge_rate_limit(text,text,integer,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_edge_rate_limit(text,text,integer,bigint) TO service_role;
