# Ayush360 HMS – Frontend Project Overview

**Product:** Ayush360, a multi-hospital (multi-tenant) Hospital Management System sold as separate modules
**Repository folder:** `C:\Ayush360\Frontend`
**Tech stack:** React 19, TypeScript, Vite, React Router 7. There is no UI library; the styling is plain CSS.
**Screenshots:** `docs/login.png`, `docs/registration-success.png`
**Status:** iteration 1 is done. The Front Desk Patient Registration screen works against a mock API.
**Last updated:** 1 October 2026

---

## 1. Source documents

| Document | What it defines |
|---|---|
| *Healthcare SaaS Platform – Architecture & Registration Module Discussion* (PDF) | Modular monolith, multi-tenancy, roles and permissions, database tables, observability |
| *Registration and Reception Workflow Guide* (DOCX) | Front desk screens: Registration, OPD Queue, Visit Details, Active Inpatients, Beds and Rooms, Inpatient Details, Inpatient Billing, Discharge |
| `Registration.png` | The visual reference for the registration screen |

---

## 2. Architecture decisions (frontend)

1. **One React app, split into modules, not micro-frontends.** Each product is a folder under `src/modules/` and is lazy-loaded.
2. **Each module can be sold on its own.** A module appears only when the hospital has bought it (`enabledModules`) **and** the user has its permissions.
3. **Each module describes itself.** Every module has a `manifest.ts`, and the app shell builds routes and the sidebar from these manifests.
4. **Modules don't import each other's code.** `npm run check:boundaries` enforces this and also runs during `npm run build`. Modules share data only through the API.
5. **The tenant comes from the server.** The frontend never sends `tenantId`. The hospital is taken from the logged-in session.
6. **Frontend hiding is UX only.** The backend must enforce licensing, permissions and tenant ownership on every request.
7. **Mock-first development.** An in-browser mock API (`src/mock`) follows the planned ASP.NET Core contract. Setting `VITE_USE_MOCK_API=false` switches to the real API.

```
src/
├── core/        auth, tenant, permissions, module registry, routing, layout, API client
├── modules/     registration · billing · doctor · nurse · pharmacy · lab · payroll
├── shared/      generic UI components and utilities
└── mock/        dev-only mock backend
```

---

## 3. Modules and roadmap

| # | Module (code) | Screens | Status |
|---|---|---|---|
| 1 | Front Desk (`REGISTRATION`) | Registration | ✅ Done |
| | | OPD Queue, Visit Details, Active Inpatients, Beds and Rooms, Inpatient Details | ⏳ Next |
| 2 | Billing and Discharge (`BILLING`) | Inpatient Billing, Discharge | Placeholder |
| 3 | Doctor (`DOCTOR`) | My Patients (own queue), consultation, prescription + print, lab orders, admission request | ✅ First version (11 Oct 2026) |
| 4 | Nursing (`NURSE`) | Vitals, nursing notes, bed cleaning | Placeholder |
| 5 | Pharmacy (`PHARMACY`) | Dispensing, returns, inventory | Placeholder |
| 6 | Laboratory (`LAB`) | Orders, samples, results | Placeholder |
| 7 | Payroll (`PAYROLL`) | Employees, salaries, payslips | Placeholder |

---

## 4. Front Desk: Patient Registration (built)

There is **one screen**: no New/Returning switch and no locked fields. The search bar decides what the form shows.

| Situation | What the form shows | Main button |
|---|---|---|
| **New patient** (nothing searched) | Empty patient and visit fields | **Registration** (collect fee → token) |
| **Existing patient, no open visit today** | Patient details filled in and editable; visit **empty** to book a new visit | **Registration**, or **Register free follow-up** when no fee is due. **Save patient details** saves corrections only |
| **Existing patient with an open visit today** (or one just registered) | Patient **and** visit details filled in and editable, plus token and receipt | **Save changes**: updates the patient and visit, with no new visit or charge. Also **Undo changes**, **Print** and **Another visit** |

- **Open visit:** registered today and still *Waiting* or *In consultation*. Once the visit is completed or cancelled, searching the patient shows an empty visit section so a new visit can be booked.
- **Age:** a required field next to Gender. Typing an age stores an estimated date of birth (flagged `dobEstimated`). Entering the exact DOB in *Additional details* replaces it, and the age then becomes read-only.
- **Payer details:** **Self** or **Insurance**. Choosing Insurance opens a panel:
  - Insurer / scheme: pick from the list (Star Health, HDFC ERGO, ICICI Lombard, PM-JAY, CGHS…) or type any name.
  - Policy number, policy holder name and relation are required. TPA, member ID and valid-until are optional; an expired policy is rejected.
  - Choosing relation "Self" fills the holder name from the patient.
  - For an existing patient, the payer from their last visit is pre-filled.
  - The OPD fee is still collected at the desk.
- **Print receipt:** a one-page A5 slip with only the essentials: hospital, receipt number, token, visit ID, date and time, patient name, ID, age and gender, doctor, department, mobile, payer, amount and payment mode. Available from the success banner and the **Print receipt** button, with no browser header or footer.
- **More than one visit for the same patient:**
  - A patient can have several open visits today, for example ENT and General Medicine.
  - **Today's visits** chips above Visit details list each open visit by token, department and doctor, plus **New visit**. Click a chip to load and edit that visit; switching is blocked while there are unsaved changes.
  - **Visit history (n)** under the patient strip lists all visits, newest first: date, visit ID, token, department and doctor, payer, fee (and whether it was a follow-up), and status. Open visits can be clicked to edit; past visits are read-only.
- **Emergency and ICU entries** (visit types *Emergency* and *ICU admission*):
  - **No consultation fee is shown or charged.** The card says "Emergency charges — billed later" or "ICU bed & care — billed per day".
  - An optional **advance / deposit** can be collected now. It goes through the payment dialog, prints a receipt and counts in My collection; the balance is billed later.
  - **Token series:** Emergency `E-001…` (visit `ER-…`); ICU `I-001…` (visit `ICU-…`). The department is set automatically to *Emergency / Casualty* or *Critical Care (ICU)*, and the arrival or admission time defaults to now.
  - **Emergency details:** arrival time, **brought by** (self, relative, ambulance, police, referral, other), **triage colour** (Red/Orange/Yellow/Green), attendant name and phone.
  - **ICU details:** admission time, **admitted from** (Emergency, OPD, ward, other hospital, direct), **ICU unit** (MICU/SICU/CCU/NICU/PICU/HDU), bed number, referring hospital. **Attendant / next of kin** name and phone are required.
  - **MLC (medico-legal case)** for both: police station (required) and FIR/GD number. The server assigns an **MLC number** (`MLC-yyyy-nnnn`).
  - Mobile and address are optional for unknown patients.
  - OPD, Emergency and ICU entries can't be converted into each other.
- **Strip above the form:** patient number, age, last visit (date and doctor), and an "Open visit today · Token" chip.
- **New patient button:** clears the form.
- **Free follow-up rule (hospital setting `followUpFreeDays`):** a visit to the **same doctor** within N days of the last **paid** consultation costs ₹0. The server works out the fee (`GET /registration/fee-quote`), and the card shows ₹0 with the normal fee struck through and "Free with this doctor until …". No payment dialog opens, and the receipt mode is *Free follow-up*, linked to the original visit. Free follow-ups don't restart the window. A hospital with the setting at 0 always charges.
- **Safety checks on the server:**
  - Only one open visit per doctor per patient per day.
  - Changing the doctor on an open visit is refused if it would change the amount already charged; that needs a cancellation or a billing adjustment.
- **Front desk numbers:**
  - *Registered today*, *Waiting* and *New patients* are hospital-wide.
  - **Collected** is per receptionist: "My collection" is the cash in their own drawer. Admins (`COLLECTION_VIEW_ALL`) see **Total collected** for all desks, plus "Mine".
  - The numbers refresh every 30 seconds and whenever the window regains focus.
  - Each receipt stores who collected it (`collectedByUserId`).
- **Several desks at once:** tokens, visit numbers and receipt numbers are generated by the server when each registration is saved. **The backend must use a database sequence or row lock per hospital per day**, so two desks saving in the same second never get the same token.
- **Payment first:** for paid visits, the visit, receipt and token are created only after payment succeeds.
- **Save draft:** kept in the browser session only and never added to the queue.

**Record identity:** one patient number per patient (`SWH-000104`). Each visit gets its own visit number (`OP-yyyymmdd-nnnn`), token (`A-nnn`) and receipt (`RC-…`).

**Demo data:**

| Patient | Situation |
|---|---|
| Suresh Kumar (`9848012345`) | Saw Dr. Meera Shah 4 days ago, so a new visit to her is a **free follow-up** at Swetha |
| Ananya Rao | Last visit was 45 days ago, so the normal fee applies |

**Hospital settings:** Swetha `followUpFreeDays = 10`; Green Valley `0` (always charges).

---

## 5. Users and roles (mock data)

The password for every account is `demo123`. Usernames are case-insensitive.

| Username | Name | Role | Hospital | Modules visible |
|---|---|---|---|---|
| `DN10110` | Devendra N | Receptionist | Swetha Multispeciality (10) | Front Desk, Billing |
| `HA10120` | Hari | Receptionist | Green Valley (20) | Front Desk only (the hospital has bought Front Desk and Doctor) |
| `PS10210` | Priya Sharma | Admin | Swetha (10) | All modules |
| `SR10310` | Dr. Sriya Reddy | Doctor | Swetha (10) | Patient Queue, Doctor, Lab |

**Hospital licences in the mock:** Swetha has all 7 modules. Green Valley has Front Desk and Doctor only.

---

## 6. API contract for the backend team (ASP.NET Core)

All endpoints are under `/api` and use a Bearer token. The tenant is resolved on the server.

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/login` | Sign in and receive `{ accessToken, user }` |
| GET | `/auth/me` | Current user, tenant, permissions and `enabledModules` |
| POST | `/auth/logout` | Sign out |
| GET | `/core/departments` | Hospital departments |
| GET | `/core/doctors?departmentId=` | Doctors with `consultationFee` |
| GET | `/registration/patients?search=` | Patient search |
| GET | `/registration/patients/{id}` | Returns 404 if the patient belongs to another hospital |
| PUT | `/registration/patients/{id}` | Correct patient details only (needs `PATIENT_EDIT`); creates no visit |
| GET | `/registration/registrations/summary` | Today's counts (whole hospital): `registeredToday`, `waiting`, `newPatients`; `myCollectedToday` = fees received by the signed-in user; `totalCollectedToday` = all desks, returned only with `COLLECTION_VIEW_ALL` (else `null`) |
| GET | `/registration/patients/{id}/context` | Patient + `openVisits[]` (all of today's open visits with receipts) + `visits[]` (history, newest first, latest 20) + `lastVisit` |
| GET | `/registration/fee-quote?doctorId=&patientId=` | Fee to collect now; applies the free follow-up rule |
| POST | `/registration/registrations` | Payment (omitted when the fee is 0) plus registration in one call. `{ patient }` = new patient; `{ patientId }` = existing; `{ patientId, patient }` also updates details. 409 if an open visit with that doctor already exists today |
| PUT | `/registration/registrations/{id}` | Edit an open visit (department, doctor, type, reason, consent). Open = today and still **Waiting**. 409 if closed, or if the fee would change |
| GET | `/doctor/queue?date=` | Day's patients: doctors get only their own (`isDoctor: true`); admins see all, view only. `counts` + `items[]` |
| GET | `/doctor/visits/{visitId}` | Patient, visit, doctor, `encounter` (null until started), `canStart`, `canEdit`, `history[]` (earlier consultations) |
| POST | `/doctor/visits/{visitId}/start` | Start consultation (own patient, today, Waiting) → visit becomes `IN_CONSULTATION` (locked at the desk) |
| PUT | `/doctor/encounters/{id}` | Save (draft) the whole consultation: notes, `vitals`, `diagnoses[]`, `prescriptions[]` (needs `PRESCRIPTION_CREATE`), `labOrders[]`, follow-up, admission |
| POST | `/doctor/encounters/{id}/complete` | Save + complete: needs chief complaints and ≥1 diagnosis; visit → `COMPLETED` or `ADMISSION_REQUESTED`; read-only afterwards |
| GET | `/doctor/icd10?search=` · `/doctor/medicines?search=` · `/doctor/lab-tests?search=` | Pick lists (ICD-10 starter list, hospital medicine list, tests); free text is always allowed |

- **Errors:** `400 { message, errors: { field: message } }` for validation; `401` when signed out; `403` when not allowed.
- **Headers:** every request sends `X-Correlation-ID`.

---

## 7. Running the project

```bash
cd C:\Ayush360\Frontend
npm install
npm run dev            # http://localhost:5173
npm run build          # boundary check + type check + production build
```

**Useful during testing:**

- Payment reference `0000` simulates a declined payment.
- `resetMockDb()` in the browser console resets the demo data.

---

## 8. Change log

| Date | Change |
|---|---|
| 1 Oct 2026 | Project created: core shell, login, mock API, Front Desk Patient Registration |
| 1 Oct 2026 | Sellable-module architecture: manifests, registry, licence checks, Billing split out, Lab and Payroll added, boundary check |
| 1 Oct 2026 | Login page simplified (demo panel removed); usernames changed to `dev`, `hari`, `priya`, `sriya` |
| 4 Oct 2026 | Usernames follow the backend rule (initials + user code + hospital id): `DN10110`, `PS10210`, `SR10310`, `HA10120`. `VITE_USE_REAL_AUTH=true` signs in through the real Identity API while the rest still uses the mock |
| 1 Oct 2026 | Visual refresh: colourful sidebar on the page background with a colour per module and a licence card; split-screen login with product highlights; Front Desk welcome banner with today's counts (registered, waiting, new patients, fee collected); 4-step progress bar (Patient → Visit → Payment → Token); token "ticket" after payment; Plus Jakarta Sans font |
| 1 Oct 2026 | Returning patients open in the editable registration form, with a strip showing patient number, last visit and an "Edited" flag; the banner subtitle was removed |
| 1 Oct 2026 | Patient details can be corrected without a new visit: **Edit details** after registering, or **Save details only** for a returning patient (`PUT /registration/patients/{id}`) |
| 1 Oct 2026 | Saved patients open locked, with the same **Edit details → Save changes / Cancel** flow both before and after registering |
| 1 Oct 2026 | Single-screen front desk: search loads patient **and** today's open visit into the same editable form (**Save changes**); a closed or absent visit shows an empty visit section for a new booking; free follow-up within the hospital's window (`followUpFreeDays`, e.g. 10 days, same doctor) |
| 1 Oct 2026 | Age field (with estimated DOB), Payer details (Self / Insurance with insurer list or free text), one-page printable registration receipt |
| 1 Oct 2026 | Users land only on screens they can open: after login (even if the previous user was on another page) and when opening a module home they can't use (e.g. a doctor on `/registration` goes to Patient Queue) |
| 1 Oct 2026 | "My collection" per receptionist; admins see Total collected (all desks) + their own; counters auto-refresh every 30 s; requirement noted that the backend must generate tokens atomically |
| 1 Oct 2026 | Multiple visits per patient: Today's visits switcher (edit any open visit) and Visit history table |
| 1 Oct 2026 | Emergency visit type: E-tokens, pay later, relaxed contact details, red emergency styling; Emergency & ICU proposal doc added |
| 1 Oct 2026 | ICU admission entry at the front desk; Emergency/ICU show no consultation fee (charges billed later) with optional advance/deposit; triage, brought by, attendant, arrival time, MLC (auto MLC number), ICU unit/bed/admission source |
| 11 Oct 2026 | State is a dropdown of all states/UTs (default Andhra Pradesh); optional Aadhaar (encrypted on the server, shown as XXXX XXXX 1234, searchable, duplicate check, never kept in drafts) |
| 11 Oct 2026 | Front desk can edit a visit only while the patient is Waiting (read-only once with the doctor) |
| 11 Oct 2026 | Doctor module: My Patients queue (own patients, next patient, filters, 30 s refresh); consultation with vitals (BMI), complaints/history/allergies (carried forward), examination, ICD-10 diagnosis (primary), prescription (medicine list + free text, dose/frequency/timing/days), lab tests, advice + review date, admission request; save / complete; A5 printed prescription; previous consultations panel. Mock DB v12 adds Dr. Sriya Reddy (SR10310) as a General Medicine doctor |
