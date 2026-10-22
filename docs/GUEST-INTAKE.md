# Yohak guest details pilot

Status: implementation candidate, not deployed to Google or production. The web preview uses fictional data in memory only. No live guest messages are sent.

## One booking, one party link

Sales uses Bookings for WEBSITE, DIRECT and PARTNER sources. CHANNEL distinguishes WhatsApp, Facebook, Instagram, walk-in and other existing options. Agencies contacting staff through WhatsApp remain SOURCE=PARTNER and CHANNEL=WHATSAPP. Do not create another booking for each conversation or passenger.

1. Enter the booking and pax. The existing edit handler generates a stable reference and missing passenger slots; real Google trigger execution still requires testing.
2. Reservations verifies status, trip/date and the booking. Guest links are restricted to CONFIRMED bookings on a matching READY_FOR_REVIEW departure.
3. Select the booking row and use **Yohak Ops → Create guest details link**. This explicitly synchronizes the passenger slots before issuing the link.
4. Copy the value in **GUEST LINK (NOT LIVE)** into WhatsApp. This legacy header remains unchanged to avoid breaking existing workbook dependencies; in staging the link is a test link, not permission for production use.
5. The lead guest fills one passenger at a time, saves progress, and submits all details. They can return through the same link before expiry.
6. Answers update the same All Guests rows. The sheet's completion and manifest formulas remain authoritative. Intake completion is not payment verification, vessel approval or Coast Guard clearance.
7. Operations checks identities, age, gender/manifest requirements, dietary and service notes, boat assignments, ETDF and Tour Details. Before final printing use **Lock guest details for manifest** on each relevant booking.
8. To reopen corrections after lock, reservations must revoke and deliberately issue a fresh link. Old links cannot be reactivated by guests.

## What changes and what does not

The guest may edit only full name, age at tour, sex/manifest entry, nationality, food allergies, dietary requirements and optional requests. The guest cannot change pax, booking reference, trip/date, price, payment, commission, boat, campsite allocation, booking status or manifest approval.

The main booker is not automatically a passenger. Guest number 1 is a passenger slot, not a copy of the payor. Food and allergy blanks are unknown; guests must explicitly type None if appropriate. Sex option X is accepted for collection but the current CG formula may require staff resolution before printing.

Increasing pax adds slots when booking synchronization runs. Old pages must reload. Decreasing pax retains excess records for staff review. Re-increasing pax does not silently reactivate an excess/inactive passenger.

## Security boundaries

- Staging-only, disabled by default. No production installer.
- Configured workbook must be private, not anyone/domain-with-link; named staff permissions remain the owner's responsibility.
- Each party has one active bearer token with a separate public identifier and hashed secret. Tokens default to seven days and are capped at 30 days. Explicit revocation and manifest lock are supported.
- The URL fragment holds the token, not a query parameter. No analytics scripts, external tracking pixels, payment data or tokens are logged.
- Possession of a link permits viewing and editing the whole party until expiry/revocation/lock. Share it only with the authorised lead guest; it is not an identity-verification system.
- Token hashes reside in Script Properties. The raw shareable link resides in the private Bookings sheet for staff use. Do not make this sheet public.
- Staff actions require a nonblank signed-in email on an explicit allowlist. Public callable functions cannot bypass this by supplying a role or email.
- Each submission rechecks booking status, trip/date, current pax, unique active passenger numbers, expiry and lock.
- Writes are field-allowlisted. Google Sheets `stringValue` is used for guest text rather than interpreting formulas.
- A script lock serializes code paths; a revision fingerprint detects stale loaded forms. Direct human edits in Sheets are not transactional with script execution: protect script-managed columns and avoid simultaneous manual passenger edits during a guest save.
- One Sheets batch atomically writes passenger cells and an audit receipt. Repeated request IDs do not create duplicates. Audit receipts contain time, booking reference, action, request ID and completion counts, not passenger details.
- Rate limiting is a basic per-token pilot control, not a hardened public-edge anti-abuse service. For scale use a dedicated website backend with managed rate limiting and durable authorization.
- This pilot reads bounded Bookings rows 4–304 and All Guests rows 4–503. Expand formulas, validations, manifests and code together, not just one constant.

## Privacy and retention gate

The owner must approve and configure YGP_PRIVACY_NOTICE before activation. State the operator identity/contact, purposes, authorised recipients, voluntary service information, retention period, correction process and rights/contact details. This is an operational implementation, not legal approval of a notice.

Do not request passport numbers, payment details or uploaded identity/medical documents. The current code does not automatically purge historical guest records or old token metadata. Before production, approve a retention policy and implement a tested retention job; do not describe data as automatically deleted.

## WhatsApp draft

Hi! To prepare your tour arrangements and passenger manifest, please complete the details for all [PAX] guests using your private link:

[GUEST LINK]

You can save your progress and return to the same link. Please keep it within your travelling party. If your tour date or guest count needs changing, message us here.

## Email phase, deliberately not activated

Resend is not called by this version. No API key is embedded, and no automatic confirmation/reminder trigger is installed.

Next increment: an approved template, a staff-reviewed recipient, an idempotent message outbox, initial email on confirmed booking, reminder only for incomplete records before an approved cutoff, stop on completion/cancellation/expiry, delivery/failure tracking, and manual WhatsApp fallback. A connected Resend account alone does not configure runtime credentials.

## Website and KAEL

This first pilot is a standalone Apps Script HTML page. It is not installed at yohak.ph and is not embedded into the live site. Once verified, link to it from Yohak communications or migrate the same guest model into a branded website route with a private server-side adapter. Do not connect an unprotected public website directly to Sheets.

KAEL can later replace the staff interface. Keep stable booking and passenger IDs, source/order-line identifiers and an explicit sync adapter. API writes and Google Form responses do not invoke a user edit event; each adapter must call a reviewed synchronization function and enforce idempotency itself.

## QA acceptance before live use

- Real staff edit creates four unique blank slots.
- Confirmed test booking issues one link; unauthorised staff and anonymous RPC calls cannot issue it.
- Invalid, expired, revoked, cancelled and manifest-locked links fail.
- Guest loads no other booking, finance or internal fields.
- Four-person partial and full saves update the correct existing rows.
- Retry after a network interruption produces one receipt, not duplicate rows.
- Concurrent page/staff edits produce a conflict instead of silent overwrite.
- Pax increases/decreases and inactive slots require correct synchronization/review.
- Formula-like and HTML-like answers remain literal text; no code executes.
- Dietary completion is not confused with payment/boat/manifest readiness.
- No actual email is sent in this version.
- Workbook remains private; no sensitive data is published in GitHub or the preview.
- Complete actual Google RPC, permission, quota, deployment and mobile tests before production.
