-- ============================================================
-- GHOSTLINE: Supabase Storage setup for media attachments
-- Run this in: Supabase Dashboard → SQL Editor
-- Project: glczzihurrenapbbepfy
-- ============================================================

-- Step 1: Create the "attachments" public storage bucket
-- (idempotent — safe to re-run)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'attachments',
  'attachments',
  true,                          -- public bucket: getPublicUrl() works
  52428800,                      -- 50 MB max per file
  ARRAY[
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif',
    'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav',
    'video/webm', 'video/mp4', 'video/quicktime',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = 52428800;

-- Step 2: Storage RLS policies
-- Policy: Authenticated users can upload files into this bucket
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated users can upload attachments'
  ) THEN
    CREATE POLICY "Authenticated users can upload attachments"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'attachments');
  END IF;
END $$;

-- Policy: Authenticated users can update (upsert) their own uploads
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated users can update own attachments'
  ) THEN
    CREATE POLICY "Authenticated users can update own attachments"
    ON storage.objects
    FOR UPDATE
    TO authenticated
    USING (bucket_id = 'attachments' AND owner = auth.uid());
  END IF;
END $$;

-- Policy: Authenticated users can delete their own attachments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated users can delete own attachments'
  ) THEN
    CREATE POLICY "Authenticated users can delete own attachments"
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (bucket_id = 'attachments' AND owner = auth.uid());
  END IF;
END $$;

-- Policy: Public read access (required for getPublicUrl() to work)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Public attachments are readable by everyone'
  ) THEN
    CREATE POLICY "Public attachments are readable by everyone"
    ON storage.objects
    FOR SELECT
    TO public
    USING (bucket_id = 'attachments');
  END IF;
END $$;

-- Verify bucket was created
SELECT id, name, public, file_size_limit FROM storage.buckets WHERE id = 'attachments';
