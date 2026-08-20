# Operator Intelligence Layer

An executive layer above the business: a 30-second **Morning Brief** as the landing page, a **Command Center** where you actually operate, universal search, a real notification center, and evidence-based insights. Every number comes from the live Cash Holdings database. Nothing about the existing backend, auth, routing contracts, engagements, CRM, projects, analytics or integrations changes behaviour.

## 1. Morning Brief (new landing page)

`/` becomes Morning Brief. It answers one question: what changed since I was last here?

- Greeting plus a "since your last visit" window (last sign-in / last visit timestamp), with relative timestamps throughout.
- Four calm sections, each line a real event with a record link:
  - **New** — engagements, contacts, projects, booked discovery calls
  - **Progress** — projects that advanced, tasks completed, pipeline stage movement, qualification improvements
  - **Attention** — overdue tasks, failed syncs, unassigned engagements, low-qualification opportunities, projects with no recent activity
  - **Wins** — discovery calls booked, projects completed, highest qualification score, revenue milestones, brand growth
- Lines only render when the underlying rows exist. A quiet period reads "Nothing material changed since yesterday." — never filler.
- One primary CTA: **Open Command Center →**.

## 2. Command Center (`/command`)

Today's Home dashboard becomes the foundation here, expanded into three columns with inline actions.

```text
LEFT                CENTER                    RIGHT
Priority Queue      Projects in motion        Upcoming calls
Notifications       Engagements + pipeline    AI Insights
Today's work        Live activity feed        Recent integrations
                                              Blocked work
```

Inline actions run without leaving the page (optimistic, then query invalidation): complete task, open record, assign engagement, advance stage, book discovery follow-up, archive notification — all through existing mutation helpers.

## 3. Universal Search (⌘K / Ctrl+K)

Expands the existing palette rather than replacing it: brands, projects, tasks, organizations, contacts, deals, **engagements**, activities, metrics, **integrations** and commands — with fuzzy matching, recent searches and pinned items (remembered locally), plus quick actions (Create Project, New Engagement, New Contact, Book Discovery, Connect Instagram, Go to Brand, Open CRM, Open Analytics). Results deep-link to the record, not just the page.

## 4. Notification Center

Notifications are **derived** from real production events — no payload duplication. Categories: Business, Operations, Integrations, CRM, Projects, Security. Each carries type, priority, timestamp, source, related record and an action button.

Read/archived state persists per operator in a new `public.notification_state` table. I will write one idempotent SQL migration to `db/notification-state.sql` for you to run in the external project — I will not touch your production database. Until you run it, the center works with local-only read state and says so once.

Key strategy (stable, replayable, state only): `engagement:<id>:new`, `engagement:<id>:booked`, `task:<id>:overdue`, `integration:<sync_run_id>:failed`, `project:<id>:status:<status>`, `contact:<id>:new`, `deal:<id>:stage:<stage>`.

Supports mark read, mark all read, archive, and unread / priority / category filters. Bell in the top bar with an unread count; no modals, no toast spam.

## 5. AI Insights

```text
Production data → deterministic engine → insight objects → AI narrative → UI
```

The engine computes engagement volume, qualification trend, booking conversion, pipeline movement, average qualification score, project throughput, overdue work, integration health, response time and revenue/completion rates. Each insight object carries value, previous, change, record count, affected brands, period, confidence and a drill-down link.

AI (Lovable AI, default flash model, server-side only) may **only** rewrite the headline, summarise significance, explain causes from the supplied numbers, and recommend an action grounded in them. It receives the computed object and nothing else. If AI is unavailable, disabled, rate-limited or returns anything not supported by the object, the deterministic card renders unchanged — same layout, no error state. With too little data: "More operational data is required before meaningful insights can be generated."

## Navigation and feel

Rail becomes: Morning Brief · Command Center · Brands · Projects · CRM · Engagements · Analytics · Integrations · Settings. Existing route paths stay valid.

Large typography, minimal cards, soft elevation, generous spacing, subtle motion. Intelligence modules lazy-load; search stays instant.

## Technical notes

- New route `src/routes/_authenticated/command.tsx`; `/` rewritten as Morning Brief. `src/lib/intelligence/` holds the derivation engine (`brief.ts`, `notifications.ts`, `insights.ts`) as pure functions over already-cached query data — no new reads beyond `notification_state` and existing helpers (`q.*`, `engagementsQuery`, `bookingEventsQuery`, `integrationSyncRunsQuery`, `integrationEventsQuery`).
- Notification state: `src/lib/intelligence/notification-state.ts` (query + mark-read/archive mutations through `cashHoldingsSupabase`), degrading gracefully when the table is absent.
- AI narrative: `src/lib/intelligence/insights.functions.ts` (`createServerFn`, key read inside the handler, never exposed to the browser).
- Shared query keys are reused so brief, command center, palette and analytics hit one cache; heavy panels sit behind lazy loading with suspense.
- Deliverables at the end: the SQL migration, the query changes, the mutation changes, the notification key strategy, and confirmation that no existing production behaviour changed.

## Verification

Live-data checks on brief / command / search / notifications / insights, theme switching (light · dark · system) across every new surface, mobile layouts, clean typecheck, and zero console errors. The signed-in screens will need your owner session to confirm the live numbers.