# Staff entry and manifest rollout

Status: merged source is not installed Google automation. All write routines remain private-STAGING only. No guest email, payment verification, capacity reservation, official manifest submission or website write is activated.

## SeaTours patterns retained

Borrow the short manual-booking intake, explicit booking and trip IDs, primary email/WhatsApp fields, paid/balance tracking, reference lookup and operations follow-up view. Do not copy customer records, stale snapshots, pending passengers into final manifests, or combined payment/booking meanings.

## Staff creation

The menu offers:

1. **New booking form:** opens a per-staff draft, avoiding one shared form for simultaneous staff members. A completed form is cleared only when the staff member deliberately starts another booking.
2. **Create booking + guest slots:** validates contact information, tour/date, pax, source/channel, partner and amounts. Only PENCIL or UNVERIFIED are accepted at intake. Reservations must separately confirm capacity and payment terms.

The new BookingEntry.gs commits one atomic Sheets request containing a booking reference, booking row, exactly pax blank passenger slots, copied formula cells, audit receipt and form result. The request ID plus payload hash makes an unchanged retry return the original reference rather than duplicating the booking. Partial provider write failure cannot leave only part of that batch committed.

Booker name is never written into passenger identity cells. Blank paid means unknown, not zero. Enter zero only when it is actually known unpaid. The original pencil start is stamped on creation; creating another booking cannot confirm payment or invent a trip/vessel.

Only a unique configured matching departure, or a staff-selected exact matching Trip ID, is accepted. No available booking/guest rows causes a clear failure rather than expansion into untested template/sample rows.

## Deliberate bounds

The candidate retains Bookings 4–304 and All Guests 4–503. Do not silently change only these constants: the live workbook's helper views and ranges must be expanded together. The initial entry pilot requires free rows inside the tested bounds and valid formula templates on row 4.

Script locks serialize this project's code, not direct manual Sheets edits or a separate website script. Restrict script-managed IDs and output columns, avoid staff editing allocation targets during saves, and implement one reviewed write authority before multi-system production use.

## Manifest architecture

The live workbook already has gated CG generation. Do not remove those checks to make a manifest appear populated.

A clean generated Ops output should read the existing Operations Data, which selects confirmed, active passengers for the exact chosen trip and boat. Keep manual historical manifest copies untouched until reconciled.

The official/CG output must remain blocked until identity, ETDF, payment review, vessel/allocation, trip and tour-detail checks pass. A generated worksheet is not an approved sailing manifest, filed document or signature.

Only the lead guest's own party confirmation is guest-facing. Never send the full internal Ops roster, another party's contact details, or sensitive service information to guests.

## Installation and acceptance

Upload BookingEntry.gs along with BookingOps.gs, GuestPortal.gs, GuestPortal.html and appsscript.json, using the guarded backup workflow. Authorise the owner account, configure the staff allowlist, run the existing staging installer, and reopen the spreadsheet menu.

Before production:

- A four-pax entry creates exactly one new booking and four guest slots in one batch.
- Unknown paid amount stays blank; balance/status formulas do not declare it paid.
- Repeating the same request creates no extra record or receipt.
- Editing an already-used request payload fails instead of silently changing the booking.
- A provider failure leaves no partially created booking or passenger set.
- No email and no phone fails; country-coded phone alone is permitted.
- Confirmation cannot bypass actual capacity/payment review.
- Same-date multiple departures require the correct explicit trip.
- Two allowlisted staff have separate draft forms.
- Existing names, IDs, templates and unrelated project files remain intact.
- Real Google permissions, formula copying, batch quotas and runtime behavior pass testing.

Local tests cover validation and the atomic request plan. They do not constitute the Google integration tests above.
