

## Run Chat Media Storage Bucket Migration

Execute the SQL migration to create the `chat-media` storage bucket and its security policies. This sets up the infrastructure for DM and public chat image uploads.

### What will be created:
- **Storage bucket**: `chat-media` (public)
- **Insert policy**: Authenticated users can upload
- **Select policy**: Public can view (needed for chat image rendering)
- **Update policy**: Users can update their own uploads
- **Delete policy**: Users can delete their own uploads

### Technical Details
Run the following SQL via the database migration tool:

```sql
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
```

