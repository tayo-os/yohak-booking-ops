# Guest intake QA

## Scope and evidence

This report distinguishes local code tests, synthetic UI tests and actual Google integration. Passing a mock test is not certification of a live Apps Script deployment.

Local suite: `npm test` passed 13 original pure-function assertions and 36 named Node test cases in `portal.test.cjs`.

Coverage includes unknown/incorrect/expired/revoked/locked tokens, disabled/privacy/staging/sharing gates, staff allowlisting, cancelled and completed bookings, four-person field allowlists, partial/full save, replay, stale revisions, pax changes, duplicate/inactive passenger slots, invalid ages, formula-like text typed as a string, request acknowledgement, script contention and provider error redaction.

## UI inventory

- Four-passenger initial state on desktop and 375px mobile.
- Passenger navigation and preservation of typed details between steps.
- Save progress: privacy acknowledgement required, visible saved state.
- Full submission: incomplete guest returns to the affected passenger.
- All guests complete: visible submitted-for-review result.
- Age validation, including zero for infants and invalid out-of-range values.
- Missing token/no-backend state; explicit demo banner when in demo mode.
- Refresh resets synthetic demo; no local storage or real Sheets connection.
- Expand/collapse service and privacy details; keyboard-focusable controls.
- No horizontal overflow at 375px; readable input controls and action buttons.

## Actual provider tests

The preceding staging session tested booking count 4→5, cancellation contribution to zero, one-trip closure, whole-date closure, and restoration of every temporary entry. These were connector-driven formula tests, not Apps Script trigger execution.

Google Sheets literal-string round-trip passed in five previously blank staging QA cells: `=1+1`, `+SUM(1,1)`, `@SUM(1,1)`, `-1+2` and an HTML script-tag string all returned exact `stringValue` in both entered and effective values. The test cells were restored afterward. This validates the chosen Sheets write representation, not a deployed guest RPC.

Playwright passed the four-person form journey in the isolated preview: acknowledgement gate, partial save, navigation with preserved answers, all four guests submitted, infant age zero, invalid age rejection, incomplete final submission returning to the required guest, privacy disclosure expansion, demo reset on reload, and desktop/mobile resizing without horizontal overflow at 375px. Desktop, mobile form and mobile footer screenshots were visually inspected. These browser tests use the explicit demo adapter, not Google.

Apps Script upload was attempted through a separate read-only clasp pull; it returned `No credentials found`. The local Comet session also failed to connect. No source was pushed to Google, no deployment changed, no script properties enabled and no guest link issued.

## Not yet verified

- Upload to the user's actual Apps Script project.
- Actual Google web-app RPC calls, anonymous guest access and OAuth scopes.
- Real manual edit trigger creating passenger rows.
- Real guest submissions writing through the deployed Advanced Sheets service.
- Token revocation/expiry/manifest locking against the actual runtime.
- Real multi-user concurrency, Apps Script quotas and interrupted Google RPC delivery.
- Privacy notice approval and retention automation.
- Website hosting, WooCommerce/form ingestion, Resend email delivery or reminders.

No live activation or production readiness claim is made.
