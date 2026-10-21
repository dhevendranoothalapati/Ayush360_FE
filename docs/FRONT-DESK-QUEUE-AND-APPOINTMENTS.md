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
- **Filters:** All, **Next patients**, Waiting, With doctor, Completed, Admission requested, Awaiting lab results,
  Emergency, Appointments.
- **Next patient per doctor:** emergencies first, then the lowest token among checked-in patients, skipping anyone
  marked "not here". When the doctor is **free** (has started OPD, not paused, nobody with them) that row **blinks
  green with "Send in now"**, and the doctor's card shows "Send in now: A-012 Ravi Kumar". The **Next patients** tab
  lists just one next patient per doctor, the ones to send in now first; its badge counts free doctors.
- **Not here:** on a next-patient row, *Not here* skips the patient for **15 minutes** (the next token becomes next);
  after 15 minutes they are back in line with their own token and become next again until they turn up. *Here now*
  puts them back immediately. Shared by all desks (stored on the visit: `notHereAt`, `notHereCount`).
- Today this relies on the 30-second refresh; instant updates come with real-time calling (section 9).
- **Date picker:** past days (history) and up to 30 days ahead (bookings for that day).
- **Pending from earlier days** (top, today only): every earlier OPD visit or booking the doctor never saw, with no
  time limit, so nobody drops off silently. ⋮ → Move to today · Change date… · Cancel visit….
  **Show / Hide** collapses it to its header and count; the choice is remembered in that browser.
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

## 9. Pending (agreed, not built)

| Item | Summary | Effort |
|---|---|---|
| **Real-time updates (SignalR)** | HMS API pushes "patient called", "queue changed", "doctor status changed" to all screens of the hospital; 30 s refresh stays as fallback. On Azure with several API copies: Azure SignalR Service. | ~2 days |
| **Call next (doctor) + Doctor rooms board (desk)** | Doctor clicks *Call next* (or picks a patient) → new status **Called**; desk sees it instantly with a sound: card per doctor (room, calling, next tokens) with *Sent in* / *Not here*. Decisions open: who calls (doctor / desk / both). | ~6 days |
| **Room number per doctor** | Needed by the board and TV; Admin setting (fixed or per day/shift – to decide). | 0.5 day |
| **TV display in the waiting area** | `/display/{screen}` page, full screen: "Now calling A-012 → Room 3", doctor cards, recently called; tokens only (no names by default); chime + voice announcement (English / Telugu / Hindi); paired with a 6-digit code → read-only display key; auto-reconnect, keep awake, nightly refresh. Hardware: Android TV stick + kiosk browser per TV. Depends on Call next. | ~3 days |

### 9.1 Lab results review (agreed 21 Oct 2026 · **Part 1 built 21 Oct**, Part 2 pending)

**Built (Part 1):** OP Queue ⋮ on "Awaiting lab results" rows → *Results expected…* (30 min / 1 / 2 / 3 hr / at a
time / tomorrow or later, shown on the row) and *Results ready* (all tests done; same day → back in the doctor's line
as **Results review**, same token, no fee, ordered after emergencies and before tokens; another day → "Lab results
ready · book a review"). Doctor queue shows the *Results review* tag in the same order; opening it reopens the same
consultation (*Start review* → with doctor) and *Complete review* finishes it. Saving a consultation no longer resets
tests the lab already finished. Endpoints: `POST registrations/{id}/lab-expected`, `POST registrations/{id}/lab-ready`.
**Pending (Part 2):** results panel with values / ranges / H-L flags and report on the consultation, review notes,
addendum view; review appointment linked to the original visit.

Today: after the consultation the visit is *Completed* with "Awaiting lab results"; nothing marks tests done yet (no
Lab module) and the patient never re-enters the queue. The doctor can already see the tests they ordered (read-only).

**Agreed flow**
1. **Expected time:** when the sample is taken the lab gives an expected time ("~1 hr") → the desk row shows
   "Results expected ~12:30" so the desk can tell the patient to wait at the front desk, or "tomorrow".
2. **Same day – automatic:** when every test of the visit is done, the visit goes back into that doctor's line
   automatically as **Results review** (same token, no new fee). The patient is waiting at the desk.
   It blinks *Send in now* when the doctor is free; *Not here* works as for any patient.
3. **Results ready later (e.g. next day):** the visit stays *Results ready*. When the patient comes back, the desk
   books a **review appointment** with the same doctor, linked to the original visit (fee per the follow-up rule,
   normally free); the results show in that consultation.
4. **Doctor screen:** queue row tagged *Results review* with the tests ✓; opening it reopens the same consultation with
   a **Lab results** panel at the top (value, unit, normal range, H/L flag, report), the earlier notes read-only,
   review notes, and changes to diagnosis / prescription kept as an addendum; *Complete review*.

**Decided (21 Oct 2026):**
- **Line order:** 1) emergencies (by triage) → 2) lab results review patients (once results are ready) → 3) everyone
  else by token number.
- **Until the Lab module exists, the front desk marks results ready** (and enters the expected time the lab gives);
  the paper report goes to the doctor with the patient. The Lab module takes this over later.
- **The doctor can always change the diagnosis or prescription**, kept as a recorded addendum (original stays visible),
  **until the patient has collected the medicines from the Pharmacy**; after dispensing the prescription is locked
  and changes need a new prescription (Pharmacy module will enforce this).

**Needs:** desk actions *Results expected at…* and *Results ready* on a visit awaiting results; result fields on lab orders (value, unit, range, flag, report, entered by / at, expected time);
visit flag `ReviewFor = LAB` + returned-at; review notes / addendum on the encounter. ~6 days with manual
results entry; the full Lab module (samples, result entry, report upload) sets "results ready" by itself later.

## Change log

| Date | Change |
|---|---|
| Oct 2026 | Patient queue for the desk, doctor strip, expected times, doctor pause with reason |
| Oct 2026 | Split into OP Queue and Inpatient Queue; pending visits from earlier days; cancel (with refund) and change date |
| Oct 2026 | ⋮ menus on rows; actions on the Registration screen (Today's visit card, pending banner); rows clickable |
| 21 Oct 2026 | Appointments: Visit date (up to 30 days), Booked state, check-in with fee, Phone appointment visit type, token given at booking, line ordered by token number |
| 21 Oct 2026 | Lab results review Part 1 built: desk "Results expected…" / "Results ready", same-day return to the line as Results review, doctor Start / Complete review |
| 21 Oct 2026 | Lab results review agreed: automatic return to the line on the same day, review appointment when results come later (section 9.1) |
| 21 Oct 2026 | Next patient per doctor blinks "Send in now" when the doctor is free; Next patients tab; Not here (skip 15 min, then back in line) / Here now; Pending from earlier days can be collapsed; real-time calling and TV display recorded as pending |
