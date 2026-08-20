# Analytics as Executive Intelligence + Light/Dark Theme

## What's actually wrong today

Verified by reading the code:

- `analytics.tsx` builds every chart from `brands / channels / deals / projects / tasks / metric_observations`. It never touches the live `engagements` pipeline — the panel labelled "Engagement Volume" is really a count of metric observations, and qualification rate and discovery bookings do not exist on the page at all.
- Several series depend on fields that are often empty in production, so they can render as flat or blank grids: project throughput keys off `projects.due_date` with `status = 'completed'`, revenue keys off won `deals.value`.
- Theme is hard-locked: `src/routes/__root.tsx` renders `<html className="dark">`, `src/styles.css` defines one palette under `:root, .dark` (no light values), the chart library hardcodes `oklch(...)` literals and white-alpha edges, and the toaster is pinned `theme="dark"`. There is no light mode to switch to.

## Plan

### 1. Analytics data audit (no backend changes)

Keep every existing query file untouched; add engagement reads by reusing `engagementsQuery` / `bookingEventsQuery` from `src/lib/engagements/queries.ts` on the analytics route.

Derived executive metrics, each from a real table:

- Engagement volume — daily `engagements.created_at`
- Qualification rate — `isQualified` / total (existing domain helpers)
- Discovery bookings — `booking_confirmed` events in `engagement_events`
- Project throughput — completed projects, with a `completed`-status fallback when `due_date` is null so the series isn't silently empty
- Task completion — `project_tasks.completed_at` plus overall completion rate
- Brand activity — engagements + activities + tasks per brand (replaces the pipeline-value-only bar)
- Revenue trend — won `deals.value`, shown only when values exist

Every panel gets a three-state contract: skeleton while loading, an intelligent empty state naming the missing input and how to create it, chart only when there is data. No chart grid renders without data.

### 2. Theme system

- `ThemeProvider` in `src/lib/theme.tsx`: `dark | light | system`, persisted in `localStorage`, resolved against `prefers-color-scheme`, applied as a class on `<html>` with a pre-hydration inline script in `__root.tsx` so there's no flash and no SSR mismatch.
- `src/styles.css`: move the current palette to `.dark`, author a real light palette (paper canvas, soft grey panels, ink text, deepened teal for contrast) for the same token names, including the surface/edge/lift layer and the `chrome-blur` utility.
- Charts, toaster and sparklines: replace hardcoded `oklch(...)` literals with token-driven values so axes, grids, tooltips and fills follow the theme.
- Theme control lives in the sidebar System group and on Settings.

### 3. Visual refinement (Analytics)

Fewer, larger panels; a compact executive summary band above them; borders replaced by elevation; roughly 30–40% more whitespace; mono technical captions replaced with executive language ("Qualified opportunities", not `QUAL_RATE`).

### 4. Engagements workspace

Three-panel layout stays. Center pane leads with the project brief, qualification reasoning and next action. Right rail becomes a true reverse-chronological feed with human event summaries ("Discovery call confirmed", "Qualification scored 82") and date grouping, rather than raw `event_type` rows.

### 5. Verification

Typecheck, then drive the live preview with an authenticated session: confirm analytics panels show live rows from the external project, toggle dark/light/system across analytics, engagements, CRM, projects and dialogs, check the console is clean, and check desktop plus mobile widths.

## Technical notes

- No changes to the Supabase project, `cashHoldingsSupabase`, schema, RLS, mutations, route paths, engagement contract, integrations, Cmd+K or global ADD.
- Analytics stays on `/_authenticated/analytics`; new work is presentation plus client-side derivation over existing queries.