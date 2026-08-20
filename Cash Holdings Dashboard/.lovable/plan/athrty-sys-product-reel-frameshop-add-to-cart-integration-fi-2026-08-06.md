# ATHRTY.SYS Product Reel — Frameshop Add to Cart Integration Fix

## Status: waiting on the component source

You chose to attach the current product reel file, but nothing new has arrived. The only files mounted are the outbound CRM workbook and an older `image.png`. A repo-wide search for `Frameshop`, `athrty`, `addToCart`, and `ProductReel` returns no component code — the only matches are `athrty-sys.framer.website` used as an allowed CORS origin in unrelated code.

So the compile error and root cause are **not yet determined**. They cannot be, without reading the file. Step 1 below is the diagnosis; everything after it is the fix contract already agreed.

## Scope guardrails

Out of scope for this task, and untouched: the outbound CRM workbook, `website-outbound-crm-dryrun`, Edge Functions, owner gates, storage downloads, `commit:false` behavior, and everything in Cash Holdings.

In scope: one Framer code component — the ATHRTY.SYS product reel.

## Step 1 — Diagnose (no edits)

Read the attached source and report, before changing anything:

- **Exact Compile Error:** line number and verbatim message
- **Root Cause:** the single defect that produces it
- **Smallest Fix:** the minimal non-destructive change

Checked in this order:

1. Smart/curly quotes inside JSX text or style objects
2. Missing `import type { ReactNode } from "react"`
3. Invalid `ControlType.ComponentInstance` typing
4. Prop-name drift across the interface, destructuring, card mapping, and `addPropertyControls`
5. A Component Instance being called as a function
6. `React.cloneElement` applied to a non-element ReactNode
7. The CTA rendered twice
8. Invalid JSX nesting
9. Undefined Frameshop instance variables

## Step 2 — Apply only that fix

Target typing:

```text
import type { ReactNode } from "react"

interface ProductReelProps {
  operatorCheckupCartButton?: ReactNode
  authorityAuditCartButton?: ReactNode
  integrationsCartButton?: ReactNode
  systemOperationsCartButton?: ReactNode
  inquiryURL?: string
}
```

Four separate `ControlType.ComponentInstance` property controls — one per sellable offer: Operator Checkup, Authority Audit, Integrations, System Operations. No array, no keyed object.

The CTA area renders the assigned instance directly:

```text
<div
  style={{
    width: "100%",
    minWidth: 0,
    marginTop: "auto",
    display: "flex",
    alignItems: "stretch",
    position: "relative",
    zIndex: 5,
    pointerEvents: "auto",
  }}
  onPointerDown={(event) => event.stopPropagation()}
  onClick={(event) => event.stopPropagation()}
>
  {frameshopButtonInstance}
</div>
```

The `stopPropagation` handlers exist so the carousel's drag gesture cannot swallow the Frameshop click.

## Behavior contract

- An assigned Frameshop instance replaces the normal CTA link — it never renders alongside it
- Exactly one CTA per card
- The instance renders directly as a ReactNode
- No `button` or `anchor` wraps the instance
- No `preventDefault`, no overwritten `onClick`, no calling the instance as a function, no cloning unless strictly unavoidable
- No custom cart is built
- Inquiry-link fallback remains for any offer with no instance assigned
- Custom project cards stay inquiry-only
- Carousel layout, styling, spacing, and drag behavior are unchanged

## Deliverable

The diagnosis block, then the complete corrected component code. Nothing is deployed or published.

## Next action

Attach the product reel `.tsx` from Framer's code editor (or paste the full source in chat), and include the red error text Framer shows if it is visible. I will start at Step 1 the moment it lands.