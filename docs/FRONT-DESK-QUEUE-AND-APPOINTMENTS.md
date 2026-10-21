# Front Desk – OP Queue, Inpatient Queue and Appointments

**Module:** Front Desk (`REGISTRATION`) · **Last updated:** 21 October 2026
Backend reference: `Ayush360_BE/docs/registration-queue-and-appointments.md`

---

## 1. Menu

| Menu item | Route | Who |
|---|---|---|
| Registration | `/registration` | Receptionist, Admin |
| OP Queue | `/registration/queue` | `QUEUE_VIEW` |
| Inpatient Queue | `/registration/inpatients` | `QUEUE_VIEW` |

All front desk screens use the same gradient header as the sidebar card (`var(--primary-grad)`).

## 2. Visit states

| State | Meaning | In the doctor's line? |
|---|---|---|
| **Booked** | Appointment (later day or phone). Token already given, fee **not** paid. | No, until checked in |
| **Waiting** | Here and paid (or free follow-up / emergency). | Yes |
| **With doctor** (`IN_CONSULTATION`) | Doctor started the consultation. | — |
| **Completed** / **Admission requested** | Doctor finished. | — |
| **Cancelled** | Cancelled by the desk with a reason (kept in history). | — |

The desk can change, move or cancel a visit only while it is **Booked** or **Waiting**. Completed visits are read-only.

## 3. Registering and booking

- **Visit date** (new OPD visit): defaults to today; pick a date up to **30 days** ahead to book an appointment.
- **Visit type → Phone appointment:** always a booking, even for today (the caller isn't at the desk).
- **Booking = token now, pay later:** the patient gets their real queue token (`A-005`) straight away, so the desk can
  tell them their number on the phone. No payment dialog, no receipt. Banner: "Phone appointment booked · pay on arrival".
- Emergency / ICU are always for today and never bookings.
- One open visit or appointment per patient per doctor per day.

## 4. Check-in (booked patient arrives)

1. Open the patient on Registration (search, or click their row on the OP Queue).
2. Banner "Appointment today — check the patient in" → **Check in & collect fee**.
3. The fee is worked out again for today (free follow-up rule) → payment dialog → receipt.
4. The token stays the same; the patient becomes **Waiting** and joins the doctor's line.
   Waiting time counts from check-in.

## 5. OP Queue

- Today's OPD + Emergency patients with their latest status; admitted (IP/ICU) patients are on the Inpatient Queue.
- **Order:** emergencies first (by triage), then waiting patients **by token number** (a booked patient who checks in
  goes ahead of walk-ins with later tokens), then with doctor, then finished, then appointments not arrived.
- **Doctor strip** (scrolls sideways): each doctor's status (available / paused with reason and expected return),
  patients waiting, average time per patient.
- **Expected time** per waiting patient from the doctor's pace (today after 3 patients, else last 30 days, else 10 min),
  shifted when the doctor is paused; "Time not known" when paused without a return time.
- **Tags:** New / Return, Free follow-up, Phone appointment, Moved from …, Insurance, Emergency + triage.
- **Filters:** All, Waiting, With doctor, Completed, Admission requested, Awaiting lab results, Emergency, Appointments.
- **Date picker:** past days (history) and up to 30 days ahead (bookings for that day).
- **Pending from earlier days** (top, today only): every earlier OPD visit or booking the doctor never saw, with no
  time limit, so nobody drops off silently. ⋮ → Move to today · Change date… · Cancel visit….
- **⋮ on a row** (Booked / Waiting, today or later): Change date…, Cancel visit… (reason required; refund of the paid
  fee for users with `PAYMENT_COLLECT`, recorded as a refund receipt in today's collection).
- Auto-refresh every 30 s; Refresh button with spinner; errors keep the last list and offer Try again.

## 6. Registration screen extras

- **Appointments banner** under the search: today's bookings (Check in), unseen visits from earlier days
  (Move to today / Change date / Cancel) and upcoming bookings (Change date / Cancel).
- **Today's visit card:** Change date / Cancel buttons while the visit is Waiting.

## 7. Inpatient Queue

All admitted patients (IP / ICU, last 30 days until Discharge exists) plus every visit where the doctor requested
admission. Bed, ward and amount pending show "–" until Beds & Billing are built.

## 8. Doctor availability (Doctor module, shown at the desk)

The doctor can pause with a reason (OT, emergency call, lunch…) and an expected return; starting a consultation ends
the pause. The desk sees it on the doctor strip and in the expected times.

## 9. Change log

| Date | Change |
|---|---|
| Oct 2026 | Patient queue for the desk, doctor strip, expected times, doctor pause with reason |
| Oct 2026 | Split into OP Queue and Inpatient Queue; pending visits from earlier days; cancel (with refund) and change date |
| Oct 2026 | ⋮ menus on rows; actions on the Registration screen (Today's visit card, pending banner); rows clickable |
| 21 Oct 2026 | Appointments: Visit date (up to 30 days), Booked state, check-in with fee, Phone appointment visit type, token given at booking, line ordered by token number |
