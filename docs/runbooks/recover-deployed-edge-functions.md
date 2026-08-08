# Recover Deployed Edge Functions Runbook

This runbook documents steps to recover and bring deployed Supabase Edge Functions
and other deployed serverless functions under source control in this repository.

Important: Do NOT attempt to redeploy or modify live functions until source is
recovered and reviewed. Do NOT fabricate implementations — the goal is to recover
the exact deployed source.

Steps:

1. Identify deployed functions missing from this repo.
   - Known deployed functions (deployment-only):
     - ATHRTY-buyer-inquiry
     - ATHRTY-stripe-webhook
     - authority-intake
     - buyer-inquiry
     - instagram-integrations
     - integrations
     - website-outbound-crm-dryrun

2. For each deployed function, recover source from the deployment environment:
   - If functions are hosted in Supabase Edge Functions, use the Supabase UI / CLI
     to download the current function source code.
   - If functions are deployed elsewhere (Vercel, Netlify, Cloud Run), obtain
     the source from that provider or from backups/CI artifacts.

3. Create a directory in the repository under `edge-functions/` matching the
   original function name and place the recovered source there. Example:

```
edge-functions/
├── ATHRTY-buyer-inquiry/
├── ATHRTY-stripe-webhook/
├── authority-intake/
├── buyer-inquiry/
├── instagram-integrations/
├── integrations/
└── website-outbound-crm-dryrun/
```

4. Validate recovered source locally where possible. Run lint/typecheck/tests.

5. Commit the recovered source to a new branch and open a PR for code review.

6. Only after review and sign-off, consider updating or redeploying functions.
   Ensure CI and manual verification are in place.

Notes:

- Never expose service-role keys or credentials in the repo. Keep secrets in
  a secure vault or CI secret store.
- Do not attempt to modify or reimplement the function logic — commit the
  recovered function as-is and document any deviations.
