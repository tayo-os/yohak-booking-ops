# Main flows

## Open guest form
- Start: isolated demo preview.
- Expect: demo-only banner, tour/date/reference, four passenger selectors and Guest 1 fields.
- Refinement: shorten the introduction so the first passenger is closer to the initial mobile viewport.

## Navigate party
- Enter Guest 1, click Next guest, then Guest 1.
- Expect entered details preserved and correct passenger heading.

## Save progress
- Click Save progress without acknowledgement: notice/authority error.
- Acknowledge and save: visible Progress saved; partial guests allowed.

## Submit all guests
- Navigate to Guest 4 and submit incomplete party: return to first incomplete guest.
- Complete four passengers and submit: submitted for team review; no actual message sent in demo.

## Invalid age
- Enter age 121 and Save progress: reject.
- Enter age 0 with other required data: accept as a valid whole-number age.

## Privacy and service details
- Expand/collapse both disclosures with keyboard or click.
- Expect explanatory text and fields remain legible and usable.

## Reload
- Reload demo: reset to four blank passenger slots and 0 of 4.

## Responsive and error states
- Desktop → 375px mobile → desktop: no horizontal overflow, usable controls.
- Missing link without demo mode: explanatory invalid-link screen with retry, not booking data.
- After deployment, fresh-context open and repeat partial save plus navigation.
