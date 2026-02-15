insert into storage.buckets (id, name, public)
values ('chat-media', 'chat-media', true)
on conflict (id) do nothing;

create policy "Authenticated users can upload chat media"
on storage.objects for insert
to authenticated
with check ( bucket_id = 'chat-media' );

create policy "Public can view chat media"
on storage.objects for select
to public
using ( bucket_id = 'chat-media' );

create policy "Users can update their own chat media"
on storage.objects for update
to authenticated
using ( bucket_id = 'chat-media' and owner = auth.uid() );

create policy "Users can delete their own chat media"
on storage.objects for delete
to authenticated
using ( bucket_id = 'chat-media' and owner = auth.uid() );