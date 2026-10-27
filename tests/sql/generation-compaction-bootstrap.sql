CREATE SCHEMA storage;
CREATE TABLE storage.objects(bucket_id text,name text);
CREATE TABLE public.ai_generation_jobs(id uuid PRIMARY KEY,wallet_address text,status text,result jsonb,created_at timestamptz default now());
CREATE TABLE public.creator_assets(id text,wallet_address text,storage_path text,ready boolean);
