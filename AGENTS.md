# Working on Yohak booking operations

This repository is public source code, not a store for guest records.

Read README.md, docs/GUEST-INTAKE.md, docs/CURSOR-AND-APPS-SCRIPT.md and docs/QA-RESULTS.md before changes.

- Preserve one immutable booking reference and one passenger slot per booking/guest number.
- Source (WEBSITE/DIRECT/PARTNER) is distinct from communication channel.
- Do not treat recorded pax, a confirmed booking or a submitted form as verified boat availability or manifest clearance.
- Keep payment verification, cash arrangement, refunds, email delivery and booking status separate.
- Never copy the booker's identity into a passenger row without explicit confirmation.
- Every public guest RPC must authenticate an unexpired, unrevoked, unlocked token and validate current booking context.
- Every staff RPC must check a signed-in allowlisted email. A browser-supplied role is never authority.
- Use explicit Sheets stringValue for guest text. Avoid setFormula or USER_ENTERED for untrusted answers.
- Do not remove staging/private-workbook gates to make a test pass.
- Do not publish real IDs, guest data, tokens, credentials, bank details, screenshots of real data or workbook exports.
- Keep .clasp.json, .local and credentials ignored. Never pull remote source over the working tree.
- Run npm test. UI changes must replay FLOWS.md at desktop and 375px.
- Mock tests do not certify deployed Apps Script behavior. Report untested boundaries.
- No automated deployment from public CI. No guest email sending, sharing changes, production activation or live website inventory writes without explicit approval.
- Google source upload and deployment-version update are separate steps. Preserve a remote backup and review unknown project files before upload.
