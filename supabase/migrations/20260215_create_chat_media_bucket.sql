-- Create the chat-media storage bucket for DM and public chat images
insert into storage.buckets (id, name, public)
values ('chat-media', 'chat-media', true)
on conflict (id) do nothing;

-- Set up security policies for the chat-media bucket

-- Allow authenticated users to upload images
create policy "Authenticated users can upload chat media"
on storage.objects for insert
to authenticated
with check ( bucket_id = 'chat-media' );

-- Allow public access to view images (since they used in chat)
-- You might want to restrict this further for private DMs, but for now 
-- to ensure they load, we'll allow public read.
create policy "Public can view chat media"
on storage.objects for select
to public
using ( bucket_id = 'chat-media' );

-- Allow users to update/delete their own uploads
create policy "Users can update their own chat media"
on storage.objects for update
to authenticated
using ( bucket_id = 'chat-media' and owner = auth.uid() );

create policy "Users can delete their own chat media"
on storage.objects for delete
to authenticated
using ( bucket_id = 'chat-media' and owner = auth.uid() );
