# Site Factory System

This directory is durable local intelligence for Cash Site OS.

## Directories

- `sites/` — one manifest per known site
- `patterns/` — reusable pattern definitions
- `observations/` — QA, revision, outcome, and critique evidence
- `variants/` — candidate pattern/site variants and selection records
- `schemas/` — lightweight JSON schemas/contracts

## Site lifecycle

`DISCOVER → REGISTER → TRACE → MODEL → BUILD/IMPROVE → QA → OBSERVE → LEARN`

## Pattern lifecycle

`CANDIDATE → TESTED → PROVEN → CONTEXTUALIZED → DEPRECATED`

A pattern may remain useful while becoming more constrained. Prefer adding context/anti-context rules over deleting history.

## Propagation policy

Cross-site improvements are never blind global replacements.

A propagation candidate must satisfy:
- target site matches pattern context
- improvement is branchable/reviewable
- no site-specific identity is erased
- QA is performed on the target site
- release remains human-gated


## Closed-loop commands

- `factory-status` — summarize durable site-factory state
- `new-site` — create a new site/build record from a prompt and rank patterns
- `qa-url` — capture responsive browser QA evidence
- `record-outcome` — attach outcome evidence and conservatively update pattern confidence
- `pattern-cycle` — generate promotion, constraint, variant-review, and propagation recommendations
- `propagation-candidates` — identify context-compatible existing sites for a specific pattern

## Confidence policy

Confidence is evidence-weighted, not aesthetic opinion.

A new pattern starts as a candidate.
QA, human approvals, revisions, conversion signals, performance signals, and client outcomes may move confidence.
Promotion to proven requires repeated evidence.
Negative evidence should constrain context before deleting history.

## Container lane

A site build and its project container are separate concepts.

`new-site` always creates the durable build record first.
A platform adapter may then provision or attach a container.
Framer container creation must be proved by the actual provider; otherwise the build waits for a supplied project URL or an external provisioner configured with `SITE_MACHINE_CONTAINER_CMD`.
