# SmartStock LiveRetail V2 — SAP Sandbox & Pilot Integration Strategy

## 1. Five-Gate Progression Model

To eliminate customer risk and guarantee smooth enterprise adoption, SmartStock progresses through 5 validation gates:

```
[ Gate 1: Stateful Mock SAP ]  → Full local simulation of OData V2 contracts + 15 failure scenarios
              ↓
[ Gate 2: SAP API Business Hub ] → Payload validation against official SAP $metadata schemas
              ↓
[ Gate 3: Customer DEV / QA ]   → Read/write validation with dedicated test plants and materials
              ↓
[ Gate 4: Customer Pilot UAT ]   → Pilot KPI baseline tracking across designated pilot store cluster
              ↓
[ Gate 5: Production Deployment ] → Controlled multi-store rollout with Digital Access monitoring
```

## 2. Customer Pilot Onboarding Checklist (Gate 3 Requirements)

When onboarding a pilot enterprise, request:
1. **Dedicated Technical User** (e.g. `SMARTSTOCK_INT`) with RFC / OData authorizations for:
   - `API_MATERIAL_STOCK_SRV` (Read MB52 baseline)
   - `API_MATERIAL_DOCUMENT_SRV` (Post Movement 551 scrap)
   - `API_PURCHASEORDER_PROCESS_SRV` (Create UB Stock Transport Orders / NB Purchase Requisitions)
2. **Dedicated Pilot Plant Code** (e.g., Plant `1001` - Store Rotterdam)
3. **Storage Locations** (e.g., `0001` - Unrestricted, `0002` - Damaged buffer)
4. **Test Material Catalog** (subset of 50–500 active SKUs across fast, slow, and perishable velocity profiles)
5. **No Production Access Initially** (All validation executed strictly in customer QA/DEV).
