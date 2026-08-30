-- ATHRTY client asset storage contract snapshot.
-- Recovery-only. No storage mutation was executed by this pass.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'athrty-client-assets',
  'athrty-client-assets',
  true,
  10485760,
  ARRAY['image/jpeg','image/png','image/webp','image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- No bucket-specific storage.objects RLS policy rows were observed in the recovery catalog query.
-- Do not invent permissive storage policies in a rebuild. Re-audit storage.objects policies and access paths before deployment.
