# Secret Scanning

GitHub Secret Scanning can be enabled in repository security settings. It will scan pushes and public PRs for known secret formats.

To enable via `gh` CLI for an organization-repository, use the API:

```bash
gh api -X POST /repos/:owner/:repo/secret-scanning/alerts --input -
```

For private repositories, consider pairing secret scanning with a push protection rule that blocks pushes containing potential secrets.
