# Cash Holdings Agent Operating Contract

This contract applies repository-wide to Hermes and any other autonomous coding agent operating in this repository.

## Mission

Improve the Cash Holdings operating system without bypassing production controls. Agents are execution capacity, not production authority.

## Authority

Agents may:

- Read repository code, documentation, history, issues, and pull requests.
- Create task branches using `hermes/<task-slug>` or another clearly agent-scoped prefix.
- Implement bounded fixes, tests, documentation, automation, and refactors.
- Run validation and report failures truthfully.
- Open pull requests and respond to review feedback.
- Record validated learnings after an outcome is known.

Agents must not:

- Push directly to `main`.
- Merge their own pull requests or enable auto-merge.
- Deploy to production or invoke destructive production operations.
- Add, rotate, print, infer, or commit secrets or credentials.
- Disable, weaken, bypass, or delete QA/security gates to make a change pass.
- Run destructive database migrations, delete production data, or weaken access controls without explicit human approval.
- Change billing, authentication, authorization, payment, checkout, or production infrastructure behavior without explicit human approval.
- Treat a successful build as proof of a successful production outcome.

## Execution Loop

Every task follows this sequence:

1. **Inspect** — understand the relevant code, contracts, dependencies, and current state before editing.
2. **Bound** — state the objective, acceptance criteria, affected systems, and risk level.
3. **Branch** — work outside `main` on a task-specific branch.
4. **Implement** — make the smallest coherent change that solves the actual problem.
5. **Validate** — run relevant checks, tests, checksum verification, and failure-path review.
6. **Red-team** — inspect for regressions, destructive behavior, silent failure, security exposure, and rollback difficulty.
7. **PR** — open a pull request using the repository contract below.
8. **Human gate** — high-risk changes remain unmerged until a human approves them.
9. **Observe** — after deployment by an authorized human/process, evaluate the real outcome.
10. **Learn** — append validated lessons to `docs/HERMES_LEARNING_LOG.md`; do not record guesses as facts.

## Risk Levels

### Low

Documentation, comments, tests, non-functional cleanup, and narrowly scoped tooling with no production behavior change.

### Medium

Application or integration code changes that alter behavior but are reversible, tested, and do not touch sensitive paths.

### High

Any change involving one or more of the following:

- `database/**`
- `edge-functions/**`
- `supabase/**`
- `**/*.sql`
- `**/DEPLOYMENT_MANIFEST.md`
- `.github/workflows/**`
- authentication or authorization
- secrets, environment configuration, or service-role credentials
- payments, billing, checkout, analytics attribution contracts, or production deployment behavior
- destructive data operations or irreversible migrations

High-risk pull requests must state `Risk level: high` and `Human approval required: yes` in the PR body.

## Pull Request Contract

Every agent-authored PR must include these sections:

- `## Objective`
- `## Scope`
- `## Validation`
- `## Risk`
- `## Rollback`
- `## Learning capture`

The PR must identify what changed, what did not change, evidence of validation, known failure modes, rollback steps, and whether any learning is provisional or validated.

## Quality Rules

- Preserve existing data and interfaces unless the task explicitly requires a versioned change.
- Prefer reversible changes and idempotent operations.
- Do not invent successful test results, production outcomes, metrics, or external state.
- Do not suppress errors merely to make automation green.
- If a required dependency, credential, environment, or external system is unavailable, stop at the boundary and report the blocker.
- When a recovery bundle contains `SHA256SUMS.txt`, its checksums are part of the integrity contract and must remain valid.

## Production Boundary

A green pull request means the proposed change passed repository checks. It does **not** authorize production deployment or prove a commercial outcome.

The default path is:

`task -> branch -> implementation -> validation -> PR -> QA firewall -> human approval -> merge -> authorized deployment -> observed outcome -> learning`

<!-- ECC:BEGIN -->
## ECC coding workflows

This repository vendors a selected ECC core bundle in `.agents/skills/`; provenance and limitations are in `.ecc/README.md` and `.ecc/manifest.json`.

- Read existing repository and directory-specific instructions first. Preserve their release, review, security, and ownership requirements; generic ECC examples do not override them or higher-priority instructions.
- Inspect the relevant implementation and state the intended change before editing. Reuse existing patterns and keep changes within the requested scope.
- Load only relevant skills: `coding-standards`, `frontend-patterns`, `backend-patterns`, `api-design`, `tdd-workflow`, `e2e-testing`, `security-review`, or `verification-loop`.
- Resolve package manager, build, lint, and test commands from this repository's manifests, lockfiles, and CI. ECC's example scripts, optional skills, hooks, and slash commands are not necessarily installed. In particular, inspect manifests directly instead of invoking the unbundled `scripts/setup-package-manager.js`.
- Use tests appropriate to changed behavior and existing project requirements. Generic coverage targets do not silently add new gates. Do not add dependencies or rewrite application architecture merely to match an example.
- Run checks with exit status preserved; avoid piping a check into head/tail in a way that masks failure. Redact sensitive matches rather than printing credentials.
- Review the final diff for regressions, security exposure, and unrelated changes. Report the checks actually run, remaining limitations, and the exact branch/commit or PR outcome. A successful commit is not proof of a deployment.
<!-- ECC:END -->
