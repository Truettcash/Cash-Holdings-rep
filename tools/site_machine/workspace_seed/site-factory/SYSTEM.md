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
