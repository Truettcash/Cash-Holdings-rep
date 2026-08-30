# Hermes QA Canary

Purpose: validate the repository's Hermes PR control path with a harmless documentation-only change.

Expected behavior:

- Pull request targets `main`.
- Hermes QA Firewall runs automatically.
- PR contract is complete.
- No sensitive paths are touched.
- No environment files or credentials are introduced.
- Recovery checksum validation still passes.

If this PR passes, the branch → PR → QA path is operational for low-risk Hermes work.
