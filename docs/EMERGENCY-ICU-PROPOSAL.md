# Emergency & ICU — Analysis and Proposal

Status: **Built 1 Oct 2026: Emergency registration and the ICU admission entry at the front desk (including brought by, attendant, arrival time, triage, MLC, ICU unit/bed and deposit). Everything else below is still a proposal.**

## 1. Where Emergency and ICU sit

```
Arrival ──► Emergency registration (Front Desk, E-token, pay later)   ← built
              │
              ▼
           Triage (nurse/doctor: Red / Orange / Yellow / Green)        ← proposed
              │
     ┌────────┼──────────────────┬───────────────────┐
     ▼        ▼                  ▼                   ▼
 Treat &   Observation        Admit: Ward       Admit: ICU / HDU / NICU / PICU   ← proposed
 discharge (ER bed, hours)    (Inpatient)       (Critical care)
                                                     │
                                         Step-down → Ward → Discharge / Death / LAMA / Transfer out
```

The ICU is an **inpatient stay**, not a registration type. The front desk opens the case. ICU details come from **admission**, **bed allocation**, **billing** and the **clinical/nursing** modules.

## 2. Emergency (built now)

- **Visit type "Emergency"** sets the casualty department automatically and creates an **E-series token** (E-001…), kept apart from the OPD A-series.
- **Treat first, pay later:** no payment step and no receipt. The fee is stored as *due* and billed later. It doesn't count in "My collection".
- **Unknown patient allowed:** mobile and address are optional. Use the name "Unknown" with gender and approximate age, and fill in details later with **Save changes**.
- Visit numbers use `ER-yyyymmdd-nnnn`. An OPD visit can't be switched to Emergency or back; register a new visit instead.
- On screen: red emergency card, a "Pay later" badge, and a printed slip titled "Emergency Registration" showing the amount due.

## 3. Proposed next for Emergency

| Idea | Why |
|---|---|
| **Triage level** (Red/Orange/Yellow/Green) with time of triage | Decides queue order; red cases jump the queue. Usually set by the nurse, so it would belong to Nursing/ER. |
| **Brought by** (self, relative, police, 108 ambulance, referral hospital) + attendant name and phone | Contact person when the patient can't speak. |
| **MLC (medico-legal case)** flag: accident, assault, poisoning, burns; police station, FIR/intimation no., MLC no. | Legal requirement in India; drives a separate MLC register. |
| **Arrival mode and time** (walk-in, ambulance, wheelchair, stretcher) | Ambulance hand-over; door-to-doctor time KPI. |
| **Quick "Unknown patient" button** | Creates "Unknown Male/Female, ~age" with a temporary ID; merge with the real record later. |
| **ER bed board** (ER-1…ER-n) | Shows who is in which casualty bed. |
| **Deposit / estimate** before admission | Common practice before ICU admission (except life-threatening and scheme patients). |

## 4. ICU — what to capture

### a) ICU admission (Front Desk / Admission desk)

- **Source:** ER, OPD, ward transfer, other hospital (referral letter).
- **Admitting consultant and department, provisional diagnosis.**
- **Unit and bed:** ICU / MICU / SICU / CCU / HDU / NICU / PICU, bed number, isolation bed, ventilator-capable bed.
- **Bed tariff per day** (ICU, HDU, isolation), plus package if any.
- **Payer:** self, insurance (**pre-authorisation number**, approved amount, TPA desk status), government scheme (PM-JAY / CGHS / ECHS).
- **Deposit and estimate:** estimated cost for N days, deposit collected, plus a counselling/consent record.
- **Attendant / next of kin:** name, relation, phone, ID proof; attendant pass number and visiting rules.
- **Consents:** high-risk consent, ventilator/central-line consent, DNR status if applicable.
- **MLC carried over** from Emergency.

### b) ICU clinical/nursing (Nursing & Doctor modules; not the front desk)

- **Vitals:** hourly (HR, BP, SpO₂, RR, temperature), GCS, pain score.
- **Ventilation and oxygen:** mode, FiO₂, PEEP; intubation and extubation times.
- **Input/output chart, infusions and drips,** blood transfusions.
- **Lines and devices:** central line, catheter, ET tube with insertion dates (for infection tracking).
- **Scores:** APACHE II / SOFA / qSOFA, pressure-ulcer risk (Braden), fall risk.
- **Daily progress notes,** handover notes.

### c) Movements and outcome

- Transfers ICU ↔ HDU ↔ ward (bed history drives per-day billing), step-down date.
- **Outcome:** discharged, transferred out, **LAMA/DAMA**, absconded, **death** (time, cause, death summary; MLC → police intimation).

### d) Billing (Billing module)

- Automatic **per-day bed charges** by unit, ventilator/oxygen per hour or day, monitor charges, consultant visits per day.
- Running bill, deposits, insurance interim bills, pre-auth enhancement requests.

### e) Dashboards

- **ICU bed occupancy:** free, occupied, cleaning, reserved; ventilators in use.
- Length of stay, mortality, re-admission within 48 h, ventilator days.

## 5. Suggested order of work

1. **Patient Queue** (already planned): OPD + **Emergency tab** with triage colour, E-tokens first.
2. **Admission & Beds** (Front Desk): admit from ER/OPD, choose unit and bed (**ICU/HDU** types + tariff), deposit, attendant, insurance pre-auth.
3. **Billing**: per-day bed and ICU charges, deposits, final bill.
4. **Nursing ICU charts** and **Doctor progress notes** (clinical modules).
5. **MLC register** and **ICU dashboards**.

## 6. Open questions for the product owner

1. Should emergency **triage** be recorded at the front desk, or only by nursing?
2. Is a **deposit mandatory** before ICU admission (with an override for critical, scheme or insurance cases)?
3. Which **ICU types** do your hospitals have (MICU, SICU, CCU, NICU, PICU, HDU)?
4. Should ICU be its **own sellable module** ("Critical Care"), or part of Inpatient/Nursing?
