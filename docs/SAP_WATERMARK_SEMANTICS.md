# SmartStock LiveRetail V2 — SAP Watermark & Inclusion Semantics (RC1)

## 1. The Critical Distinction: Query Timestamp vs. Incorporated Sequence

In enterprise SAP retail deployments:
- `as_of_timestamp` represents when the extraction query ran or when the SAP snapshot was generated.
- In distributed environments, POS and store transactions take variable time to reach SAP via POS Data Management (POS DM) or IDocs.
- Therefore: **Event timestamp prior to SAP checkpoint timestamp does NOT imply SAP has processed that event.**

## 2. Watermark Data Model

Every `SAP_CHECKPOINT` event includes a `checkpoint_source_watermarks` object:

```json
{
  "event_type": "SAP_CHECKPOINT",
  "quantity_delta": 42,
  "business_timestamp": "2026-08-22T14:00:00Z",
  "checkpoint_source_watermarks": {
    "POS__1001": 187221,
    "POS__1002": 94102,
    "WMS__DC01": 55182,
    "SYSTEM": 412
  }
}
```

## 3. Inclusion Decision Logic

When an additive event $E$ arrives (even late):

```
1. Lookup source key K = "${E.source_system}__${E.location_id}"
2. If K is found in position.checkpoint_source_watermarks:
      Let S_max = checkpoint_source_watermarks[K]
      If E.source_sequence <= S_max:
          -> SAP baseline already includes E.
          -> Action: SKIP delta mutation to avoid double-deduction.
      Else:
          -> SAP baseline did NOT include E.
          -> Action: APPLY quantity delta to estimated_on_hand.
3. If K is NOT found in watermarks (e.g. unknown source or no watermarks present):
      -> Safe default: APPLY quantity delta (prevent silent inventory loss).
```
