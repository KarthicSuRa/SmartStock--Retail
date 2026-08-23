# SmartStock Pilot Candidate RC1 — Demonstration Facilitator Guide

## Scenario Overview
- **Enterprise**: RetailCo Netherlands
- **Facility**: Amsterdam Flagship Store 1002
- **Material**: MAT-33104 (Lavazza Espresso Crema 1kg, Unit Price: €18.50)
- **Time Window**: 09:00 to 12:55

---

## 8-Step Storyboard Facilitator Narrative

### Step 1 (09:00): Morning Stock Baseline Sync
- **What to say**: *"Every morning, SmartStock receives an authoritative baseline snapshot from SAP S/4HANA via standard OData services. Notice that Lavazza Espresso starts at 24 units with 94% confidence and an active sequence watermark."*
- **Screen**: Pilot Demo Storyboard (`/demo`), Step 1.

### Step 2 (10:34): Mid-Morning Velocity Surge
- **What to say**: *"During trading hours, POS sales events are ingested into the canonical event ledger in sub-second time. 13 sales events decrement our operational digital twin to 11 units on-hand, while SAP system of record remains un-updated until evening batch."*
- **Screen**: Step 2.

### Step 3 (10:36): Stockout Risk & Confidence Degradation
- **What to say**: *"SmartStock's velocity forecasting model predicts a stockout in 3.2 hours. Because the last physical count was 9 days ago, confidence drops to 61%. Rather than immediately ordering blindly, SmartStock generates a VERIFY_INVENTORY task for floor staff."*
- **Screen**: Step 3 & Exception Actions (`/actions`).

### Step 4 (10:43): Cycle Count Observation Recorded
- **What to say**: *"A floor worker performs the count on their mobile PWA, finding 8 units instead of 11. Crucially: SmartStock treats this as an OBSERVATION, not an instant mutation, avoiding phantom inventory overwrites."*
- **Screen**: Step 4 & Floor Staff PWA (`/floor`).

### Step 5 (10:45): Manager Approves Count Adjustment
- **What to say**: *"The store manager reviews the -3 unit discrepancy with full financial context (€55.50 variance). Upon approval, an immutable COUNT_ADJUSTMENT event updates operational stock to 8 units."*
- **Screen**: Step 5 & Exception Actions (`/actions`).

### Step 6 (10:46): Multi-Factor STO Optimization
- **What to say**: *"SmartStock evaluates replenishment options: Eindhoven Store 1005 has 28 units surplus. Rather than a 3-day vendor purchase order, SmartStock recommends an emergency internal stock transfer with a 2-hour delivery window."*
- **Screen**: Step 6 & Replenishment & STO (`/procurement`).

### Step 7 (10:49): ERP Commit Ambiguity Recovery (OUTCOME_UNKNOWN)
- **What to say**: *"When SmartStock submits the STO to SAP, we simulate a realistic enterprise failure: SAP commits the STO, but the network drops before responding. SmartStock's durable outbox marks the job OUTCOME_UNKNOWN, probes SAP by external reference, confirms creation of STO 4500019281, and prevents duplicate purchase order posting."*
- **Screen**: Step 7 & Integration Control Tower (`/admin/integrations`).

### Step 8 (12:55): Intraday SAP Checkpoint Reconciled
- **What to say**: *"When the next SAP checkpoint arrives, continuous reconciliation matches both systems at 20 units. Total resolution time was 2h 19m, protecting €228 in estimated sales exposure."*
- **Screen**: Step 8 & Reconciliation Console (`/admin/reconciliation`).
