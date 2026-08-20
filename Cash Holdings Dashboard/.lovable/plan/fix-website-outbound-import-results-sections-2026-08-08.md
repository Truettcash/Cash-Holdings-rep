# Fix Website Outbound Import results sections

Only `src/routes/_authenticated/admin.imports.website-outbound.tsx` changes. No Edge Function, schema, auth, routing, or dry-run invocation changes. Production Import stays disabled.

## What's wrong

The dry-run response contains `results.counts` and one row array, `results.preview`. It does not contain `proposedInserts`, `proposed_updates`, `skipped`, `tier_issues`, `status_issues`, or `duplicates` arrays at all. The lower sections look for those missing arrays, find nothing, and render "0 / No proposed inserts reported." even though the top cards read the real counts.

The response's real row arrays are: `results.preview`, `results.ambiguous_matches`, `results.failed_rows`. Counts live in `results.counts` (`inserted`, `updated`, `skipped`, `ambiguous`, `failed`), plus `results.tier_totals`, `results.stage_totals`, and `results.expected` for validation checks.

## Changes

**Proposed inserts**
- Count comes from `results.counts.inserted`.
- Rows come from `results.preview`. Because the payload marks no per-row insert/update flag, attribute rows honestly:
  - `updated === 0` -> all preview rows are inserts (this run: 57 of 57).
  - `inserted === 0` -> no rows listed.
  - both greater than zero -> list all preview rows with a caption stating the payload does not label rows per action, so the split cannot be attributed per row.
- No invented fields; only keys present on each preview row are rendered.

**Proposed updates**
- Count from `results.counts.updated`. Rows from `results.preview` under the mirrored rule. This run: count 0, empty list.

**Skipped rows**
- Count from `results.counts.skipped`. The payload carries no skipped-row array, so show the count and state that the response returns a count only, instead of implying zero rows.

**Ambiguous matches / Failed rows**
- Read `results.ambiguous_matches` and `results.failed_rows` with counts from `results.counts`. These already exist; confirm the section reads the nested `results.*` path.

**Tier / Status validation**
- Replace the missing-array lookups with the real fields: `results.tier_totals` versus `results.expected` (tier1/tier2/tier3) and `results.stage_totals` versus `results.expected` (ready/research_needed), rendered as expected-vs-actual rows with an OK/mismatch marker.

**Duplicate / idempotency**
- The payload has no duplicate array. Present it from what exists: each preview row's `deterministic_event_idempotency_key`, with a duplicate-key count derived from those keys, so the section reflects real data rather than a phantom empty array.

**Section empty-state semantics**
- Distinguish "the response reported zero" from "the response has no such array". A section whose backing array is absent says so; a section whose count is genuinely 0 says zero.

## Technical notes

- Keep existing `Surface`, `RowTable`, `Stat`, `StatusRow` styling and the Copy/Download JSON actions untouched.
- Replace the loose `pickRows` key-guessing with explicit reads of `results.counts`, `results.preview`, `results.ambiguous_matches`, `results.failed_rows`, `results.tier_totals`, `results.stage_totals`, `results.expected`, falling back to top-level equivalents so an older payload still renders.
- `RowTable` gains optional `count` and `note` props so a section can show a payload count that differs from the rendered row length.
