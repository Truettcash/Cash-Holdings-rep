## Objective

Describe the problem and the exact outcome this PR is intended to produce.

## Scope

List the systems/files changed and explicitly note material systems not changed.

## Validation

Document tests, checks, checksum verification, manual inspection, and any validation that could not be completed.

## Risk

Risk level: low | medium | high  
Human approval required: yes | no

List failure modes, production impact, data impact, security implications, and sensitive paths touched.

## Rollback

State the concrete rollback path. If rollback is not clean/reversible, explain why.

## Learning capture

State what should be added to `docs/HERMES_LEARNING_LOG.md` after the real outcome is observed. Mark hypotheses as provisional.

---

### Agent checklist

- [ ] I inspected the relevant current state before editing.
- [ ] I made the smallest coherent change that solves the stated problem.
- [ ] I did not commit secrets or credentials.
- [ ] I did not disable or bypass a QA/security gate.
- [ ] I validated relevant failure paths.
- [ ] I documented incomplete validation honestly.
- [ ] I included a rollback path.
- [ ] High-risk changes are explicitly marked for human approval.
