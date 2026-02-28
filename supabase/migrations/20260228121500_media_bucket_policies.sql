-- supabase/migrations/20260228121500_media_bucket_policies.sql
-- Private media bucket + org-scoped storage.objects RLS policies

begin;

-- Create bucket (idempotent)
insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public;

-- RLS policies for storage.objects in bucket 'media'
-- Convention in this repo: policies often include explicit service_role bypass via auth.role() = 'service_role'.
-- Org scoping: allow only objects whose name begins with one of the user's organization_ids + '/'.

drop policy if exists "media_objects_select_org_prefix" on storage.objects;
create policy "media_objects_select_org_prefix"
on storage.objects
as permissive
for select
to public
using (
  auth.role() = 'service_role'
  or (
    bucket_id = 'media'
    and exists (
      select 1
      from public.organization_users ou
      where ou.user_id = auth.uid()
        and storage.objects.name like (ou.organization_id::text || '/%')
    )
  )
);

drop policy if exists "media_objects_insert_org_prefix" on storage.objects;
create policy "media_objects_insert_org_prefix"
on storage.objects
as permissive
for insert
to public
with check (
  auth.role() = 'service_role'
  or (
    bucket_id = 'media'
    and exists (
      select 1
      from public.organization_users ou
      where ou.user_id = auth.uid()
        and storage.objects.name like (ou.organization_id::text || '/%')
    )
  )
);

drop policy if exists "media_objects_update_org_prefix" on storage.objects;
create policy "media_objects_update_org_prefix"
on storage.objects
as permissive
for update
to public
using (
  auth.role() = 'service_role'
  or (
    bucket_id = 'media'
    and exists (
      select 1
      from public.organization_users ou
      where ou.user_id = auth.uid()
        and storage.objects.name like (ou.organization_id::text || '/%')
    )
  )
)
with check (
  auth.role() = 'service_role'
  or (
    bucket_id = 'media'
    and exists (
      select 1
      from public.organization_users ou
      where ou.user_id = auth.uid()
        and storage.objects.name like (ou.organization_id::text || '/%')
    )
  )
);

drop policy if exists "media_objects_delete_org_prefix" on storage.objects;
create policy "media_objects_delete_org_prefix"
on storage.objects
as permissive
for delete
to public
using (
  auth.role() = 'service_role'
  or (
    bucket_id = 'media'
    and exists (
      select 1
      from public.organization_users ou
      where ou.user_id = auth.uid()
        and storage.objects.name like (ou.organization_id::text || '/%')
    )
  )
);

commit;
