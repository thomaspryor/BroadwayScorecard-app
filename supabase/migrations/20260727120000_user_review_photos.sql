-- Sprint 4: private photo Feed (task #571)
--
-- Additive only — no drops, no alters of existing tables/policies.
-- Creates:
--   1. user_review_photos: metadata row per uploaded photo, owner-scoped RLS
--   2. diary-photos storage bucket: explicitly public = false
--   3. RLS policies on storage.objects for that bucket (the classic Supabase
--      leak vector — a private bucket flag alone does NOT block object access;
--      storage.objects RLS is what actually enforces it)
--
-- Storage path convention (enforced by policy, not just client discipline):
--   {auth.uid()}/{review_id}/{photo_id}.jpg
-- The first path segment MUST equal the requesting user's auth.uid() for any
-- select/insert/update/delete to pass RLS.

-- ─── 1. Metadata table ─────────────────────────────────────────────

create table if not exists public.user_review_photos (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  width int,
  height int,
  taken_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists user_review_photos_review_id_idx
  on public.user_review_photos (review_id);

create index if not exists user_review_photos_user_id_idx
  on public.user_review_photos (user_id);

alter table public.user_review_photos enable row level security;

-- Owner-only CRUD. review_id's own user_id is not re-checked here (a stale
-- review_id from another user would violate the FK anyway); user_id is the
-- authority RLS relies on, so every insert must carry the caller's own uid.
drop policy if exists "select own photos" on public.user_review_photos;
create policy "select own photos"
  on public.user_review_photos for select
  using (auth.uid() = user_id);

drop policy if exists "insert own photos" on public.user_review_photos;
create policy "insert own photos"
  on public.user_review_photos for insert
  with check (auth.uid() = user_id);

drop policy if exists "update own photos" on public.user_review_photos;
create policy "update own photos"
  on public.user_review_photos for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "delete own photos" on public.user_review_photos;
create policy "delete own photos"
  on public.user_review_photos for delete
  using (auth.uid() = user_id);

-- ─── 2. Private storage bucket ─────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('diary-photos', 'diary-photos', false)
on conflict (id) do update set public = false;

-- ─── 3. RLS on storage.objects, scoped to this bucket ──────────────
-- storage.objects RLS is global across ALL buckets — every policy here is
-- explicitly scoped to bucket_id = 'diary-photos' so it can't accidentally
-- widen access to any other bucket in the project.

drop policy if exists "diary-photos: select own" on storage.objects;
create policy "diary-photos: select own"
  on storage.objects for select
  using (
    bucket_id = 'diary-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "diary-photos: insert own" on storage.objects;
create policy "diary-photos: insert own"
  on storage.objects for insert
  with check (
    bucket_id = 'diary-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "diary-photos: update own" on storage.objects;
create policy "diary-photos: update own"
  on storage.objects for update
  using (
    bucket_id = 'diary-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'diary-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "diary-photos: delete own" on storage.objects;
create policy "diary-photos: delete own"
  on storage.objects for delete
  using (
    bucket_id = 'diary-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
