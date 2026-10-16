# ATHRTY PX-V1 | Vercel/Hatchable release evidence

Date: 2026-10-16
Scope: PR #34, ATHRTY Vercel public flagship preview, Hatchable PX13 reference
Source authority: Hatchable project proj_OjMkFUze3JKr, inspected v1066
Environment: protected Vercel preview; production not promoted

## Architecture verified
- Vercel static company shell isolated to website/. Original Cash Holdings operator implementation and the governance repository remain separate.
- All seven public routes returned HTTP 200.
- Generated asset endpoints athrty-tokens.css, athrty.css and athrty.js returned HTTP 200.
- Redirects /studio, /login, /diagnose and /inquiry each returned HTTP 307 and the expected corresponding Hatchable URL.
- Public Hatchable sign-in, builder-selection and contact pages rendered in live browser sessions.

## Responsive evidence
A same-origin browser srcdoc + computed-style harness measured 63 page/width combinations: seven routes × 320, 375, 390, 430, 768, 881, 1024, 1440 and 1920px. Results: zero page-wide horizontal overflow, zero duplicate primary CTA states, and exactly one main h1 per route. Homepage additional checks at 880px and 1090px also passed.
Real browser screenshots rendered and were visually inspected at 375px and 1440px following token compilation.

These are browser layout measurements, not physical devices. They do not establish all-content zoom, virtual keyboard, hardware safe-area, platform WebView, or font-loading edge-case certification.

## Accessibility and interaction evidence
- Primary navigation landmark, one main landmark, footer, hidden-until-focus skip link and accessible text on visible controls present in inspected home DOM.
- Mobile menu open state reported aria-expanded=true, focused first nav link and locked page scroll; a DOM KeyboardEvent('Escape') closed the menu, restored focus and re-enabled scrolling.
- Browser-computed contrast against the declared tokens: foreground/canvas 18.34:1; muted/canvas 9.43:1; muted/raised panel 7.58:1; on-mint/mint 13.77:1.
- CSS has visible focus styling and a reduced-motion override.

The Escape test was synthetic, not a physical keyboard or screen-reader session. VoiceOver/TalkBack, focus behavior with real hardware input, full WCAG audit and color contrast over dynamic imagery remain unverified.

## CI and release controls
- ATHRTY Flagship Contract workflow passed on prior release candidate; checks deterministic token generation, routes, landmarks and live Hatchable PX13 token parity.
- Hermes QA Firewall passed after the PR description was updated to state objective, scope, validation, high risk, required human approval, rollback and learning.
- Vercel preview build READY.
- The independent legacy Vercel `cash-holdings-rep` status is unrelated to the `athrty-flagship` preview and remains a separate remediation path.

## Remaining release gates
- Physical-device responsive testing on representative iOS/Android hardware.
- Actual VoiceOver/TalkBack and keyboard-only navigation.
- LCP, CLS and INP instrumentation/production performance budgets and measured results.
- Authenticated seller → proposal → checkout → builder → recovery → publish-review E2E (owned by Hatchable services), including real provider evidence.
- Production domain/alias and explicit human release approval.

Decision: Keep the public flagship preview isolated. Do not mark zero-defect or promote to production until outstanding gates have evidence.

## Rollback
PR #34 is feature-branch isolated. Revert the branch changes or redeploy the previously known preview, without modifying Hatchable checkout, authentication, Supabase records or private operator workflows.
