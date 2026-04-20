-- =======================================
-- Add categories.logo_url + category-logos storage bucket + RLS
--
-- Path convention: {organization_id}/{category_id}/logo-{timestamp}.{ext}
-- This keeps the first folder segment as org_id so the existing RLS pattern
-- (matching `(storage.foldername(name))[1]` against the caller's org) works
-- identically to org-logos.
-- =======================================

-- 1. Column on categories
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS logo_url text;

-- 2. Bucket (public read — logos are displayed on multiple surfaces including
--    unauthenticated preview states during navigation)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'category-logos',
  'category-logos',
  true,
  2097152, -- 2 MB
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 3. RLS policies for storage.objects in bucket 'category-logos'

DROP POLICY IF EXISTS "public_read_category_logos" ON storage.objects;
CREATE POLICY "public_read_category_logos" ON storage.objects
FOR SELECT
USING (bucket_id = 'category-logos');

-- Admin uploads/updates/deletes only to their own org folder; super_admin any.
DROP POLICY IF EXISTS "admin_insert_category_logo" ON storage.objects;
CREATE POLICY "admin_insert_category_logo" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'category-logos'
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

DROP POLICY IF EXISTS "admin_update_category_logo" ON storage.objects;
CREATE POLICY "admin_update_category_logo" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'category-logos'
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

DROP POLICY IF EXISTS "admin_delete_category_logo" ON storage.objects;
CREATE POLICY "admin_delete_category_logo" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'category-logos'
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
