# Finish and attach the baseline archive

`/mnt/documents/cash-holdings-live-baseline.zip` does not exist — the export run was interrupted after the files were staged but before the archive was written. `/mnt/documents` is empty; the staged, unmodified copy of the source is still intact at `/tmp/baseline/cash-holdings-live-baseline/` (178 files, including `.env.example` with names only and `GENERATED-FILES.md`).

Per your instruction to rebuild only if the file is missing, this plan zips the already-staged copy — no re-collection, no source changes.

## Steps

1. Zip `/tmp/baseline/cash-holdings-live-baseline/` to `/mnt/documents/cash-holdings-live-baseline.zip` (files copied verbatim; nothing regenerated or reformatted).
2. Verify the archive: entry count matches 178, `.env` is absent, and no secret-like values are present.
3. Attach it in chat as a downloadable artifact.
4. Report filename, byte size, and SHA-256 checksum, plus confirmation that it is attached.

No application files are touched and nothing is deployed.