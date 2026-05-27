# Production Testing - 2026-05-27

Target: `https://digiwonder.vercel.app`

Deployment commit: `ae34626` (`feat(rate-card): use configurable deterministic formula`)

## Scope

- Add, edit, delete KOL
- Add, edit, delete campaign
- Add and archive post
- API access protection
- Download campaign PDF
- Upload spreadsheet data path
- Cron secret protection
- Deterministic estimated rate-card formula

## Authentication

Testing used an existing Better Auth session cookie supplied by the requester. The cookie was valid for production RPC requests and browser navigation. No password or OAuth re-login was needed.

If the cookie expires, a fresh logged-in browser session cookie is required, specifically `__Secure-better-auth.session_token` for `digiwonder.vercel.app`.

## Results

| Area | Result | Evidence |
| --- | --- | --- |
| API unauthenticated access | Pass | `POST /api/rpc/kol/list` without session returned `401` |
| API authenticated access | Pass | `client.kol.list()` with session returned 2 existing KOL records |
| Add KOL | Pass | Created production test KOL id `3`; estimated rate source was `formula` |
| Edit KOL | Pass | Updated test KOL display name successfully |
| Delete KOL | Pass | Deleted test KOL id `3` successfully |
| Upload XLSX path | Pass | Exercised same backend bulk import path used by spreadsheet upload; summary `success: 1, skipped: 0, failed: 0, total: 1` |
| Add campaign | Pass | Created production test campaign id `2` |
| Edit campaign | Pass | Updated test campaign name/status/date/objective successfully |
| Add post | Pass | Added Instagram post `DYzDtOdxZBd`; sync status returned `success` |
| Archive post | Pass | Archived post id `4`; `archivedAt` returned |
| Delete campaign | Pass | Deleted test campaign id `2` successfully |
| Download PDF | Pass | Browser downloaded `campaign-1-report.pdf`, 3575 bytes |
| Cron without token | Pass | `GET /api/cron/sync-kols` returned `401` |
| Cron wrong token | Pass | `GET /api/cron/sync-kols` with wrong bearer returned `401` |
| Cron correct token | Pass | `GET /api/cron/sync-kols` with configured bearer returned `200 {"ok":true,"synced":0}` |

All temporary test KOL/campaign/content records created during this run were cleaned up after the test.

## Deterministic Rate Formula

Estimated rate cards now use a deterministic formula instead of ONNX/ML inference. The formula reads settings from `app_settings.rate_card_formula_settings` and can be changed from the admin Settings page.

Inputs used from the database:

- `kol_profile.total_followers`
- `kol_profile.engagement_rate`
- `kol_profile.average_views`
- primary account platform
- `kol_profile.follower_tier`
- number of connected social platforms
- number of campaign history records

Default formula basis:

- Follower component: `followers * IDR per follower`
- Engagement component: `followers * engagementRate% * IDR per engagement`
- View component: `(averageViews / 1000) * view CPM`
- Multipliers: platform, tier, campaign-history bonus, multi-platform bonus
- Format outputs: post as base, story/reel as configurable multipliers
- Range output: configurable min/max spread around suggested rate

Default numbers were calibrated conservatively from public 2025-2026 influencer pricing references:

- Shopify documents engagement-based pricing as `followers × engagement rate × rate per engagement`.
- Indonesia public benchmarks show nano creators around hundreds of thousands to low millions IDR, micro creators around hundreds of thousands to several million IDR, and macro creators in the millions to tens of millions IDR.
- CPM/view-based pricing is commonly used for video-heavy formats, so average views are included with a configurable CPM.

Sources:

- https://www.shopify.com/blog/influencer-pricing
- https://www.arfadia.com/services/influencer-marketing
- https://influenceflow.io/resources/influencer-rate-cards-and-pricing-strategies-the-complete-2025-guide/

## Notes

- The spreadsheet upload UI parses `.xlsx` client-side, then calls `kol.bulkImport`. This test exercised that backend path directly with the same input shape after verifying local build.
- The PDF generator is client-side; production PDF download was verified with a real browser download event.
- The supplied session can be reused only while it remains valid. For future tests, a fresh logged-in session cookie is enough.
