Branch protection rules should be configured in the repository settings or via the GitHub API/CLI.

Recommended rules for `main` branch:

- Require status checks to pass before merging:
  - `CI` (runs `npm test`)
  - `E2E Tests` (Playwright)
  - `CodeQL` (security analysis)
- Require linear history (no merge commits) or squash merges depending on workflow
- Require signed commits (optional)
- Require pull request reviews before merging: at least 1 approval
- Dismiss stale pull request approvals when new commits are pushed
- Require branches to be up to date before merging
- Restrict who can push to the branch (maintainers or a team)

To apply using `gh` CLI (example):

```bash
gh api repos/:owner/:repo/branches/main/protection -X PUT -f required_status_checks.contexts='["CI","E2E Tests","CodeQL"]' -f enforce_admins=true -f required_pull_request_reviews.dismiss_stale_reviews=true -f required_pull_request_reviews.required_approving_review_count=1
```
