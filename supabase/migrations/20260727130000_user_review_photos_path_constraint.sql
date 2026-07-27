-- Sprint 4 follow-up (security review, 2026-07-27): tie storage_path to
-- user_id at the DB level. Without this, RLS still blocks account B from
-- ever reading/writing the underlying storage object, but B's own INSERT
-- policy (auth.uid() = user_id) alone would let them insert a metadata row
-- whose storage_path points into a folder that isn't their own — a data
-- integrity gap even though no cross-account read/write actually succeeds.

alter table public.user_review_photos
  add constraint user_review_photos_storage_path_owner_check
  check (split_part(storage_path, '/', 1) = user_id::text);
