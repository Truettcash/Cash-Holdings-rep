# ATHRTY Outbound Recovery Manifest

Recovery pass: `outbound-v1-critical-spine`
Observed production project: `ldijllskwwmyhhbzspmb`
Recovery mode: source-parity only. No Supabase deploy, database mutation, secret rotation, Framer publish, or outbound send was performed by this recovery pass.

## Recovered in this pass

| Function | Live version | verify_jwt | Production `ezbr_sha256` |
|---|---:|---|---|
| `prospect-research-pipeline` | 30 | true | `cda8efa208e7af4550c6ecc2f4d3d1adbcce1403923debfddb2f50d76f6bd5fa` |
| `prospect-score-v2` | 26 | true | `0be97ecda218d81a775ca6be571465c47617020e8254f51899995bc296f97b7f` |
| `prospect-account-intelligence` | 25 | true | `8feeb7e2a23d27acf528741adc2f9da1c3e8050310d55ddf8644147dfb9d6f5a` |
| `athrty-preview-factory-run` | 16 | true | `d1f2e8c48e6bbb3b1caa9fd1f5d32852b6211ba05173cb6d199b4cfacc61cf9e` |
| `athrty-framer-publisher` | 34 | true | `1cca51cb24bfcb6614cd63b58cc93bb9551fe4e99c06b569078082873327a82c` |
| `prospect-outreach-compose` | 35 | true | `d22f3d75fbcbd6a883c82d855851a6b2b2aa6acf0576aba53f091f352e19cc47` |
| `prospect-outreach-red-team` | 27 | true | `da6ba174fbeae4cef009a728cfa152cdd16cd1ba8e63aac32568ef7f8bafd0c9` |
| `prospect-outreach` | 28 | true | `8f4e87f20ec1fccd952fc7af0781639691d2248af930cd24eec11944480c8ba1` |
| `prospect-response-intelligence` | 25 | true | `ce87c180b7dc7ea278767130738f9385876f0a52dbb5249ee846f1b1ba13ec55` |

The production hash above is Supabase deployment metadata. It is recorded as deployment identity evidence and should not be assumed to equal the Git blob SHA or a local single-file SHA-256.

## Commercial path now represented

```text
research orchestration
  -> score / research economics
  -> account intelligence / decision state
  -> preview strategy + QA + release gate
  -> Framer build/publish adapter
  -> evidence-specific outreach composition
  -> adversarial red-team
  -> deterministic quality + human approval + send gate
  -> reply classification / negotiation / lifecycle update
```

## Important gates preserved from production

- authenticated user validation before service-role-backed operations
- A/B prospect tier and data/evidence thresholds before contact composition
- SS+ account model must resolve to `contact` before initial outreach composition
- red-team can only reduce sendability; it cannot authorize send
- deterministic draft review and `policy_passed` are required
- explicit human approval is required before `send_one`
- suppression list checks, daily caps, organization touch caps, cooldowns, approval expiry, postal disclosure, and opt-out language are enforced before send
- preview production blocks release below QA 88 or when responsive/contact/attribution contracts fail
- response intelligence routes opt-out, reply state, negotiation, and follow-up/watch state back into the commercial model

## Known production dependencies still pending recovery

These live functions are called by the recovered critical spine but are not yet source-controlled in this pass:

| Function | Live version | verify_jwt | Production `ezbr_sha256` | Role |
|---|---:|---|---|---|
| `prospect-intelligence-crawl` | 25 | true | `6739adb5e4ebc85d5bb3221a30971d41d2d6bee90b1ffe6a7abfd9ee617d6cb1` | first-party website evidence/crawl |
| `prospect-channel-scan` | 24 | true | `a939617bc57788270511a16e86c84de9b45e7d0b789d9305d62e96dacee63d45` | public channel discovery |
| `prospect-profile-enrich` | 25 | true | `9713e09d9ca1673b76cf12a92e56470080d171e90d04dbf6d84b311005fb5bc5` | evidence/contact/channel consolidation |
| `prospect-brand-dossier` | 24 | true | `ab190421bd595688b96c0c70efa93f25b35efcd75b1367c6b93c32039d2d9adf` | public-evidence semantic dossier |
| `prospect-discover-google` | 27 | true | `51bd597d6ba0a07e085b9f089155f289353c6dd8fc0a43d19b30830ec15f9da7` | Google Places discovery |

Additional preview dependencies such as asset harvesting, checkout, design-learning RPCs, QA/release RPCs, and database schema objects also remain part of the convergence backlog.

## Recovery rule

Do not refactor or deploy the recovered functions as part of this source-recovery commit. First establish source coverage and dependency parity. Runtime hardening, behavior changes, threshold changes, automated-send policy changes, and schema changes must be separate reviewed PRs with explicit human approval.
