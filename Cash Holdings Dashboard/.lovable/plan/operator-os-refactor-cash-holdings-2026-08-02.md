# Operator OS Refactor — Cash Holdings

A UI/UX-only refinement. No backend, schema, query, mutation, route-path, auth, or Edge Function changes. Every existing route and data contract stays exactly as-is; only presentation, layout, motion and information architecture change.

## 1. Design language pass (`src/styles.css`)

Recalibrate the existing token layer rather than replace it:

- Spacing scale stepped up ~30–40% (panel padding 3.5 -> 5/6, row heights 26 -> 32, gaps 2 -> 4).
- Typography hierarchy: real display / title / body / label tiers instead of near-uniform 11–12px. Inter stays; mono reserved for labels and numerics only.
- Borders reduced — separation carried by surface elevation and soft shadow rather than hairlines everywhere.
- Teal restricted to active/selected state and single-point emphasis. No decorative gradients.
- Motion primitives: `fade`, `scale-in`, `slide-up`, drawer/modal/palette easing, all behind the existing `prefers-reduced-motion` block.

## 2. Authentication

Single centered card on the obsidian canvas: wordmark, "Welcome back", Email, Password, Forgot password, Continue. Nothing else. Reset-password screen matches. Sign-in success fades into the dashboard instead of hard-cutting.

Preserved verbatim: `cashHoldingsSupabase`, `signInWithPassword`, neutral non-enumerating reset copy, lapsed-session notice, recovery routing.

## 3. Navigation (grouped IA, no route changes)

```text
Overview      Dashboard
Operate       Brands · Projects · Tasks
Pipeline      CRM · Engagements
Intelligence  Analytics · Integrations
System        Data Health · Settings
```

Quiet section labels with generous spacing, Linear/Raycast feel. Active route uses a minimal teal indicator, not a filled pill. Brands maps to the existing portfolio route. Collapsed rail keeps icons + tooltips. Mobile keeps the same hierarchy in the drawer, plus a bottom bar for the five section anchors.

## 4. Home — executive briefing

One 1440x900 viewport, in reading order:

1. Welcome line + Today's Priorities summary.
2. Executive KPI row — Revenue, Projects, Deals, Tasks, Pipeline. Subtle lift on hover revealing a secondary insight line; values count up on mount.
3. Holdings Priority Queue and Portfolio Health Matrix side by side.
4. Recent Activity and Upcoming Work.

Duplicate metrics removed, card chrome simplified. All figures come from the current queries — no new data sources.

## 5. Charts

Rounded smooth lines, animated draw-in, unified hover readout, responsive containers, real empty states and skeletons across `src/components/charts`. Analytics reframed around trends — Growth, Velocity, Pipeline, Brand Performance, Revenue, Traffic, Conversions — with interactive range/brand filtering on the existing metric queries.

## 6. CRM, Projects, Integrations

- **CRM**: pipeline first, then organization detail, then contact detail. Minimal tables, searchable, calmer cards.
- **Projects**: three panels — Project Index, Current Work, Project Intelligence. Blockers and progress promoted, noise removed.
- **Integrations**: reorganized by operational state, connected systems elevated as a live command center.

```text
Connected Systems   Instagram · YouTube · Google Analytics · eBay
                    real status, last sync, health, account, disconnect, configure
Available Systems   Google · Microsoft · Calendly   (connect + description)
Future Systems      Shopify · Stripe · Facebook · LinkedIn · TikTok · Threads · GitHub
                    disabled, "Coming Soon" badge, no status indicator
```

One reusable integration card with `connected | available | coming-soon` states. No fabricated status or sync values — connected-state fields render only from the existing `integration_accounts_safe` / sync-run queries; a live provider with no data shows an honest unknown. Providers with no backend wiring are never given a Connect button.

Note: Google, Microsoft and Calendly have no connector in the current integration layer, so their Connect action will surface a "not yet wired" notice until that server-side work is done — this refactor adds no backend.

## 7. Motion, mobile, performance, accessibility

Page and card transitions, hover motion, number counting, chart draw-in, drawer/modal/palette animation. Mobile: bottom navigation, refined drawer, natural card stacking, resizing charts, no overflow. Heavy chart and table sections lazy-loaded; memoized derivations to cut re-renders; TanStack Query keys and caching untouched. Keyboard navigation, visible focus rings, reduced-motion support and contrast all verified.

## 8. Audit before handoff

Sign-in / forgot / reset / session persistence / sign-out; every route loading without console errors; charts, empty and loading states; Authority Systems and Truett Cash engagements with brand filters, event history and briefs; integration workspace status accuracy; mobile responsiveness; no layout shift.

## Technical notes

Files touched: `src/styles.css`, `src/components/ui-bits.tsx`, `src/components/charts/index.tsx`, `src/components/app-sidebar.tsx`, `src/components/auth-shell.tsx`, `src/components/add-drawer.tsx`, `src/components/command-palette.tsx`, `src/components/priority-queue.tsx`, `src/routes/auth.tsx`, `src/routes/auth_.reset-password.tsx`, `src/routes/_authenticated/*` (presentation only), plus a new bottom-nav component and a new integration-card component. `src/lib/**` query and mutation modules, `src/integrations/**`, `edge-functions/**`, `db/**` and `src/routeTree.gen.ts` are not modified — with one exception: the integrations page needs a presentation-level catalog list of non-wired providers, which will live in a new UI-only constants file rather than in `src/lib/integrations/types.ts`.
