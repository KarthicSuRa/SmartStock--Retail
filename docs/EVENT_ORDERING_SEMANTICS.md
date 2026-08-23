# SmartStock LiveRetail V2 — Event Ordering & Checkpoint Watermark Semantics

## 1. Event Classification: Additive vs. Anchoring

Events entering SmartStock are classified into two deterministic projection categories:

### A. Additive Events (Commutative for quantity sums)
- Types: `SALE`, `SALE_REVERSAL`, `RETURN`, `GOODS_RECEIPT`, `TRANSFER_IN`, `TRANSFER_OUT`, `DAMAGE`, `EXPIRY`, `COUNT_ADJUSTMENT`, `MANUAL_ADJUSTMENT`
- Quantity Representation: Signed `quantity_delta`
- Behavior: Commutative for final inventory arithmetic ($A + B = B + A$). Out-of-order arrival within a reconciliation cycle produces identical final stock, but sequence gaps or late arrivals trigger operational warning cases.

### B. Anchoring Events (Non-commutative Checkpoint Boundaries)
- Types: `SAP_CHECKPOINT`
- Quantity Representation: Absolute quantity as of `business_timestamp`
- Behavior: Defines an authoritative baseline boundary. Sets `inventory_position.checkpoint_watermark = event.business_timestamp`.
- **Watermark Invariant**: Any additive event whose `business_timestamp <= checkpoint_watermark` is already captured in the SAP snapshot and **must not be re-applied**. Only additive events with `business_timestamp > checkpoint_watermark` mutate the position on top of the checkpoint.

## 2. Watermark Processing Algorithm

```
Given an incoming event E with business_timestamp T_E:
Given an existing position with checkpoint_watermark T_W:

If E.event_type == 'SAP_CHECKPOINT':
   position.erp_checkpoint_qty = E.quantity
   position.estimated_on_hand  = E.quantity
   position.checkpoint_watermark = T_E
   position.reconciliation_status = 'PENDING_RECONCILIATION'

Else if T_E <= T_W:
   // Event occurred prior to or at the checkpoint
   // Do NOT mutate estimated_on_hand (already reflected in SAP baseline)
   record_event_as_pre_watermark(E)

Else:
   // Event occurred after the checkpoint
   position.estimated_on_hand += E.quantity_delta
```
