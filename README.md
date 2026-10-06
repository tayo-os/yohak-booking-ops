# Yohak Booking Ops

Candidate Apps Script module for a two-working-tab booking workbook. This code is not installed, not production-verified, and does not activate guest messaging or website synchronization.

## Scope

- Stable booking references under a document lock.
- Per-booking missing passenger-slot creation without copying the booker's identity.
- Idempotent slot reconciliation; duplicate guest numbers stop the operation.
- Pax reductions preserve passenger records and mark excess slots for staff review.
- Immutable 48-hour pencil start timestamp when PENCIL is entered; existing unknown dates are not backfilled.
- Exact product/date matching only when there is one departure candidate.
- No guessed boat assignment, legal capacity, payment verification or guest identity.

The workbook formulas handle effective expiry and visible completion. This module does not overwrite the stored PENCIL status, auto-confirm payment, or send messages. A guest-form response remains unverified intake; no ingestion handler is included.

## Staging installation

1. Copy the approved workbook to a private workbook whose name includes `STAGING`.
2. Confirm timezone Asia/Manila. Do not copy guest data into a public repository.
3. Inspect any existing bound script and triggers. Do not replace or delete existing code.
4. Add `BookingOps.gs` as a separate module. There are no default `onEdit` / `onOpen` names, avoiding dispatcher collisions.
5. Run `yohakInstallStaging` as the staging workbook owner, review requested Google permissions, then authorize if appropriate.
6. Test real spreadsheet edits using synthetic records. The local test file checks pure functions only.
7. Stop on schema mismatch, runtime failure, duplicate references or insufficient free rows. Check execution logs and reconcile partial writes before retry.
8. Do not enable production until tests below pass. A production installer is deliberately absent.

The trigger does not run for API writes, form responses or WooCommerce imports. Each future intake adapter must call a reviewed synchronization path itself. Trigger delivery, multi-cell pastes and Apps Script execution limits require staging tests.

## Required acceptance tests

- Enter a manual party of four; exactly G1-G4 appear, all names blank and completeness red.
- Edit pax 4→6; only G5-G6 are created, and existing details remain attached to their original guest numbers.
- Repeat sync; no duplicates appear.
- Reduce 6→3; details for G4-G6 remain and become EXCESS - REVIEW, not deleted.
- Increase again; inactive/excess named passengers are not silently reactivated.
- Duplicate reference or guest number blocks synchronization.
- Create PENCIL; one immutable timestamp appears. Unrelated edits do not extend it.
- At exactly 48 hours without verified proof, effective state is EXPIRED.
- Cash-on-arrival does not set paid, verified proof, or CONFIRMED.
- Verified proof changes to PAYMENT REVIEW, not automatic confirmation.
- Cancel a booking; counts exclude it and records remain.
- Change product/date: choose a unique matching departure or show ambiguity; never guess between boats.
- Missing boat, ETDF, trip details or inconsistent passenger totals leave CG output blocked.
- Multi-row pasted edits, inserted columns and row sorting preserve all IDs.
- Never process sample rows or exceed the declared booking/guest boundaries.
- Public form submissions cannot overwrite a booking, payment or existing passenger without verification.

## Development in Cursor

Use this module as a staging candidate, not as proof of live deployment. Run `node test.cjs`. Build mocks for the spreadsheet adapter and test interrupted writes, concurrent edits, schema migration and pasted ranges before adding production installation.

Current pilot bounds are Bookings rows 4-304 and All Guests rows 4-503, deliberately excluding workbook examples. Do not silently increase just one range: counts, validation, manifests, source checks and scripts must be expanded together.

## Public repository policy

Only this source folder is a candidate for publication. Exclude private operator documents, workbook exports, guest records, payment information, spreadsheet IDs, source URLs containing customer data, `.clasp.json`, credentials and logs.

Repository: `tayo-os/yohak-booking-ops`. Public code-only publication was approved by the owner. The existing private Yohak website repository remains separate and must not be made public.

## Files and checks

- `BookingOps.gs`: disabled-by-default, bound Apps Script candidate.
- `appsscript.json`: V8 manifest with spreadsheet and trigger-management scopes.
- `test.cjs`: synthetic pure-function tests; run `npm test`.
- `.claspignore`: allows only the script and manifest to be pushed to Apps Script.

To work in Cursor, clone this repository and run `npm test`. Keep all actual spreadsheet IDs and clasp credentials local. Production activation remains a separate review gate.
