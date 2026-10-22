# Cursor and Apps Script deployment

GitHub stores the source. The Google Apps Script project runs a separately uploaded copy. Editing GitHub does not automatically change a deployed Google web app.

## Files to edit

- `BookingOps.gs`: booking reference, pencil timestamp, slot creation and trip matching.
- `BookingEntry.gs`: per-staff new-booking form, contact/payment input checks and atomic booking-plus-passenger creation.
- `GuestPortal.gs`: token access, data validation, Sheets adapter, audit and staff menu actions.
- `GuestPortal.html`: mobile guest form; no real data embedded.
- `appsscript.json`: runtime, scopes and Advanced Sheets service.
- `portal.test.cjs`: synthetic adapter/security tests.
- `docs/GUEST-INTAKE.md`: staff flow, boundaries and rollout gates.

## First Cursor setup

```sh
git clone https://github.com/tayo-os/yohak-booking-ops.git
cd yohak-booking-ops
git checkout feature/guest-details-portal
npm ci
npm test
```

Configure the exact **staging script ID** from Apps Script Project Settings, not its deployment ID, web-app URL or spreadsheet ID:

```sh
npm run gas:configure -- YOUR_STAGING_SCRIPT_ID
```

The config and target receipt are private local files excluded from Git. Do not put actual IDs, guest data, tokens, environment files or Google credentials into this public repository.

## Google authorisation

On your trusted development computer, authenticate the pinned clasp CLI using the account that owns the staging script:

```sh
npx clasp login
```

Review the Google consent request yourself. Enable the Apps Script API in your Google Apps Script user settings if required. Do not paste OAuth refresh tokens into chat or commit them. The Google Drive connector's access does not imply Apps Script API authorization.

## Safe source update

```sh
npm run gas:push
```

This runs tests, verifies the local staging target and shows the file list without uploading. Review it, then:

```sh
npm run gas:push -- --apply
```

The apply command first pulls the remote project into a private `.local/backup-*` directory. It refuses unknown extra project files rather than deleting unrelated code. It recognises the original Yohak `Code.gs`/`Code.js` candidate and replaces that with `BookingOps.gs`; do not retain duplicate definitions.

This uploads source, **not a new deployment version**. Manually review and update the intended staging web-app deployment after setup and tests. Keep the old version available for rollback. Never use `--force` to work around an unexplained mismatch.

If browser or clasp access is unavailable, code can still be edited, tested and saved in GitHub, but Google runtime changes remain pending.

## Script Properties

In the staging Apps Script project's settings, set:

| Property | Value |
|---|---|
| `YGP_SPREADSHEET_ID` | Exact private staging workbook ID |
| `YGP_STAFF_EMAILS` | Comma-separated individual staff email addresses |
| `YGP_ENABLED` | `false` initially |
| `YGP_WEBAPP_URL` | Approved staging deployment's `/exec` URL |
| `YGP_PRIVACY_NOTICE` | Owner-approved privacy notice text |
| `YGP_LINK_HOURS` | `168` for the initial seven-day pilot, or approved duration |

Do not store a token or Resend key in HTML.

## Owner-only staging installation

1. Verify the bound spreadsheet is the intended private STAGING copy, timezone Asia/Manila.
2. Review existing script files and triggers before uploading. Upload BookingOps.gs, BookingEntry.gs, GuestPortal.gs, GuestPortal.html and appsscript.json; do not duplicate the original Code.gs definitions.
3. Inspect the manifest. This version adds spreadsheet access by explicit ID, read-only Drive sharing inspection, signed-in email identification and Advanced Sheets API access.
4. Configure properties above and approve the notice; review OAuth permissions using the owner account.
5. Run `yohakInstallStaging`. Existing edit-handler triggers are reused; do not create duplicates.
6. Set `YGP_ENABLED=true` only for staging, then run `yohakPrepareGuestPortal`. It creates the intake audit tab and does not send anything.
7. Update the intended web-app deployment. Execute as the owner. Anonymous token-based guests require guest access permitted by Workspace policy; obtain owner approval for that deployment audience. Never make the spreadsheet public.
8. Reload the sheet. An allowlisted staff account should see the Yohak Ops menu.
9. Use a synthetic confirmed booking on a future matching READY_FOR_REVIEW departure. Create a link, test it in a signed-out browser and verify the exact four guest rows.
10. Lock the test form, verify writes fail, and review the manifest readiness checks. Archive the synthetic booking through the normal cancellation flow.

No production installer is included. The staging-name gate is intentional; do not rename the live workbook or remove the gate as a shortcut.

## Cursor prompt

> Work on this repository's guest-details staging branch. Read docs/GUEST-INTAKE.md and docs/QA-RESULTS.md first. Preserve one booking and one guest row per stable passenger slot. Keep source/channel attribution, payments, booking confirmation and manifest approval separate. Run npm test before proposing changes. Never commit customer data, real workbook/script IDs, guest tokens, clasp credentials or logs. Use the guarded gas:push workflow only after verifying the staging target and remote backup. Do not enable production, send messages, change sharing or publish a guest deployment without explicit approval. Expand the real Apps Script acceptance tests, then add the approved Resend outbox as a separate change.

## Dependency note

The pinned clasp 3.4.1 development tool currently has npm advisories through its micromatch/braces dependency tree. These packages are not shipped to Apps Script or the static preview. Do not run it on untrusted repositories or attacker-controlled glob patterns. Recheck `npm audit` before installation and upgrade when a compatible fix is available; no forced downgrade or automatic audit fix has been applied.
