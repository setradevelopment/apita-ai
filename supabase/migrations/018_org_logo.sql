-- =======================================
-- Add organizations.logo_url + org-logos storage bucket + RLS
-- =======================================

-- 1. Column on organizations
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS logo_url text;

-- 2. Bucket (public read for rendering across the app)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'org-logos',
  'org-logos',
  true,
  2097152, -- 2 MB
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 3. RLS policies for storage.objects in bucket 'org-logos'
--    Path convention: {organization_id}/{filename}

-- Public read (logos are displayed on multiple surfaces)
DROP POLICY IF EXISTS "public_read_org_logos" ON storage.objects;
CREATE POLICY "public_read_org_logos" ON storage.objects
FOR SELECT
USING (bucket_id = 'org-logos');

-- Admin uploads/updates/deletes only to their own org folder;
-- super_admin operates on any org folder.
DROP POLICY IF EXISTS "admin_insert_org_logo" ON storage.objects;
CREATE POLICY "admin_insert_org_logo" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'org-logos'
  AND (
    public.get_my_role() = 'super_admin'
    OR (
      public.get_my_role() = 'admin'
      AND (storage.foldername(name))[1] = (
        SELECT organization_id::text FROM public.profiles WHERE id = auth.uid()
      )
    )
  )
);

DROP POLICY IF EXISTS "admin_update_org_logo" ON storage.objects;
CREATE POLICY "admin_update_org_logo" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'org-logos'
  AND (
    public.get_my_role() = 'super_admin'
    OR (
      public.get_my_role() = 'admin'
      AND (storage.foldername(name))[1] = (
        SELECT organization_id::text FROM public.profiles WHERE id = auth.uid()
      )
    )
  )
);

DROP POLICY IF EXISTS "admin_delete_org_logo" ON storage.objects;
CREATE POLICY "admin_delete_org_logo" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'org-logos'
  AND (
    public.get_my_role() = 'super_admin'
    OR (
      public.get_my_role() = 'admin'
      AND (storage.foldername(name))[1] = (
        SELECT organization_id::text FROM public.profiles WHERE id = auth.uid()
      )
    )
  )
);
