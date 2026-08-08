# Push Protection

Push protection, preventing accidental pushes that expose secrets or bypass checks, can be configured in repository settings and by enabling branch protection rules.

Recommended options:

- Restrict push access to maintainers or specific teams.
- Require pull requests for merging to protected branches.
- Enable secret scanning and block pushes with confirmed secrets.
- Enable required status checks.

Use the GitHub UI or API/gh CLI to enforce these protections.