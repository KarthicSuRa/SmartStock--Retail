# Runbook: Disaster Recovery — Projection Reconstruction Procedure

## Purpose
Restore entire operational digital twin state (`inventory_position`) after a catastrophic database loss or projection corruption by replaying the immutable `inventory_events` ledger.

## RPO & RTO Targets
- **Recovery Point Objective (RPO)**: $\le 15 \text{ minutes}$
- **Recovery Time Objective (RTO)**: $\le 4 \text{ hours}$ (Measured during pilot drill: **18 minutes**)

## Reconstruction Steps
1. **Restore Base Database**:
   Verify `inventory_events` table row counts and integrity against the last known database backup.
2. **Clear Corrupted Read Models**:
   ```sql
   TRUNCATE TABLE inventory_position;
   TRUNCATE TABLE projection_applied_events;
   ```
3. **Trigger Event Replay**:
   Invoke `projection-worker` with `{ "action": "REBUILD", "tenant_id": "<tenantId>" }`.
4. **Monitor Queue Drain**:
   ```sql
   SELECT * FROM v_projection_queue_slo;
   ```
5. **Run Reconciliation Verification**:
   Verify against SAP baseline checkpoints:
   ```sql
   SELECT * FROM v_reconciliation_summary;
   ```
6. **Verify Reconciliation Rate**:
   Ensure rate exceeds **99.0%** before opening system traffic to store staff.
