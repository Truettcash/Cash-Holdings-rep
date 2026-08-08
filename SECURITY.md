# Security Policy

If you discover a security vulnerability in this project, please report it privately to the maintainers so we can address it promptly.

- Email: security@your-organization.example (replace with a real address)
- Public disclosure: Please do not disclose until a fix or mitigation is available.

Preferred reporting format:

- Description of the issue
- Steps to reproduce
- Affected versions
- Any suggested mitigations

We will respond within 72 hours.

## Do Not Add (Security & Privacy Rules)

Do not add the following to the repository (or remove them immediately if they were added):

- Service-role keys or long-lived credentials for servers or cloud services.
- Production secrets (API keys, DB passwords, signing keys).
- Raw prospect PII (personally identifiable information) into analytics or telemetry pipelines.
- Redux, Zustand, or other global state libraries unless the app outgrows `react-query` + local component state.
- Direct client-side writes to CRM tables (all writes should go through a controlled server-side API with proper authorization and validation).

If any of the above are accidentally committed, rotate the secrets immediately, remove them from history (e.g., using git filter-repo), and notify security owners.
