-- Run compact_saved_generation_images only AFTER all ticket readers deploy
-- generation-result.ts. Existing clients still receive a fresh signed imageUrl.
create or replace function public.compact_saved_generation_images(p_limit integer default 100)
returns integer language plpgsql security definer set search_path=public as $$
declare changed integer;
begin
  with candidates as (
    select j.id,a.storage_path from public.ai_generation_jobs j
    join public.creator_assets a on a.id=j.id::text and a.wallet_address=j.wallet_address
    join storage.objects o on o.bucket_id='creator-assets' and o.name=a.storage_path
    where j.status='succeeded' and a.ready and coalesce(j.result->>'savePending','false')='false'
      and j.result->>'libraryId'=j.id::text and j.result->>'imageUrl' like 'data:image/%'
      and a.storage_path like j.wallet_address||'/'||j.id::text||'/%'
    order by j.created_at limit least(greatest(p_limit,0),100)
    for update of j skip locked
  )
  update public.ai_generation_jobs j set result=(j.result-'imageUrl')||jsonb_build_object(
    'storedMedia',coalesce(j.result->'storedMedia','{}'::jsonb)||jsonb_build_object('imageUrl',c.storage_path))
  from candidates c where j.id=c.id;
  get diagnostics changed=row_count;
  return changed;
end $$;
revoke all on function public.compact_saved_generation_images(integer) from public,anon,authenticated;
grant execute on function public.compact_saved_generation_images(integer) to service_role;
