# Microsoft 365 Production Recovery Manifest

Production project: `ldijllskwwmyhhbzspmb`
Recovery mode: read-only source extraction. No function redeploy, sync execution, or database mutation performed for this package.

## Edge Functions

| Slug | Version | verify_jwt | Production deployment SHA |
|---|---:|---|---|
| m365-connection-health | 7 | false | `748612b09407ea32627292b2cc15f25d149ec4bb62619a7659469931f87e0337` |
| m365-sharepoint-discovery | 4 | true | `e11f265e250dad90ea077b4747849193c912217df9ae9d716fd2473d7a3c0d5d` |
| m365-sync-sharepoint-dryrun | 6 | true | `f085fb38a42982a9db2a1b38c450efc3fb07dd2623de571c2708d2d48f923c58` |
| m365-sync-sharepoint | 3 | true | `087a450dbc402c0a37c1b185653303c90950102568c1cc63f56b6cce5fc6fd50` |

The deployment SHA above is Supabase deployment metadata (`ezbr_sha256`), not necessarily the SHA-256 of the single `index.ts` file. Use the supplied source files as the authoritative extracted source text.

## Required environment variable names

Common Microsoft app credentials:
- `M365_TENANT_ID`
- `M365_CLIENT_ID`
- `M365_CLIENT_SECRET`

Where used by the sync functions:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- supported existing fallbacks in production source: `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE`

No credential values are included in this package.

## Runtime connection

- connection id: `f304a30c-b8c4-4d94-9860-e8634efe6b1f`
- provider: `microsoft_365`
- auth type: `client_credentials`
- credential ref: `supabase_env:m365_athrty_client_credentials`
- status: `connected`
- sync_enabled: `true`

## Source identities

SharePoint site:
`athrtysys.sharepoint.com,50b59472-e861-4e4f-8bcc-81ec8d302646,f619fbc4-04ca-47de-bd86-e6f2aab02a73`

ATHRTY Outbound list:
`6aae0aa7-a978-4d0d-a67e-ffbbd5a11108`

## Recovery rule

Treat the files in this package as production-source evidence. Do not refactor, normalize auth, redeploy, rerun the production sync, or alter Supabase as part of source-control recovery. First source-control the recovered artifacts and verify the diff.
