# SmartStock LiveRetail V2 — SAP S/4HANA Integration Architecture

**Audience:** SAP architects, integration leads, platform engineers, security reviewers  
**Status:** Current implementation (branch `fix/pos-webhook-integration-audit`, commit `9ed0a66`)  
**Scope:** How SmartStock connects to SAP S/4HANA (and ECC via the same OData V2 contract), what must exist on the SAP side, and how each business task is executed.

> **Grounding rule for this document:** every mechanism described here is taken from the code in `supabase/functions/` and `supabase/migrations/`. The audit items that were fixed are recorded in **§14 Previously identified limitations — resolution status**; residual gaps that require SAP-side configuration are called out in §14.5.

---

## 1. Executive summary

SmartStock is a multi-tenant retail inventory platform running on Supabase (PostgreSQL + Edge Functions) with a Next.js front end. It integrates with SAP through **server-to-server OData V2 APIs**, never by direct RFC or database access.

The integration is built around one abstract contract, `IERPAdapter`, implemented by:

| Adapter | File | Purpose |
|---|---|---|
| `SAPAdapter` | `supabase/functions/_shared/erp-adapter/sap-adapter.ts` | Real S/4HANA / ECC OData V2 integration |
| `MockAdapter` | `supabase/functions/_shared/erp-adapter/mock-adapter.ts` | Local development / UAT rehearsal; never writes real document numbers |

The adapter is selected per tenant from `erp_configurations` by `AdapterFactory` (`_shared/erp-adapter/factory.ts`). If no active configuration exists, the factory falls back to `MockAdapter`; the procurement executor refuses to run a real (non-dry-run) batch against a mock adapter.

### Design principles enforced in code

1. **Integrity over convenience.** A movement that cannot be mapped with confidence is rejected with an actionable error instead of being posted as a plausible-but-wrong document (`resolveMovement`).
2. **No invented identifiers.** A SAP document number is only ever the number SAP returned. Simulated runs never write a document number into the ledger (`sap-batch-sync`, `postPurchaseRequisition`, `postPurchaseOrder`).
3. **Outcome-unknown is not a retry.** A dropped response or HTTP 5xx during a write is classified as `OutcomeUnknownError`; the document may already exist in SAP, so blind retries are forbidden (`errors.ts`, `sendMaterialDocumentBatch`, `erp-batch-execute`).
4. **Stateless adapters.** The adapter talks only to SAP. Database joins (e.g. local-vs-ERP reconciliation) happen in the edge function that owns the Supabase client.
5. **Least business invention.** Missing company code, purchasing group, plant, vendor, price, or account assignment is a hard error, never defaulted (`defaults()`, `resolvePlant`, PO payload builder).

---

## 2. Architecture at a glance

```
┌────────────────────────────┐        ┌──────────────────────────────────────────┐
│ Store / HQ clients          │        │ Supabase                                  │
│ Next.js PWA, POS terminals  │        │  Auth (JWT, tenant claim)                 │
│                             │        │  PostgreSQL (operational read models,     │
│                             │        │  staging, outbox, audit, DLQ)             │
└──────────────┬──────────────┘        │  Edge Functions (Deno)                    │
               │ HTTPS + JWT           │    erp-master-sync    (inbound)           │
               ▼                       │    sap-batch-sync     (outbound moves)    │
┌────────────────────────────┐         │    erp-batch-execute  (outbound PRs)      │
│ API gateway / scheduler     │────────▶│    erp-emergency-po   (outbound PO)       │
│ (cron, service token)       │         │    erp-goods-receipt  (inbound GR)        │
└────────────────────────────┘         │    erp-reconciliation (stock compare)     │
                                       │    sap-extractor      (read-only info)    │
                                       └───────────────┬──────────────────────────┘
                                                       │ OAuth2 bearer + CSRF
                                                       │ OData V2 JSON over HTTPS
                                                       ▼
                                       ┌──────────────────────────────────────────┐
                                       │ SAP S/4HANA / ECC                         │
                                       │  SAP Gateway (OData V2)                   │
                                       │   API_PRODUCT_SRV                         │
                                       │   API_MATERIAL_STOCK_SRV                  │
                                       │   API_MATERIAL_DOCUMENT_SRV               │
                                       │   API_PURCHASEREQ_PROCESS_SRV             │
                                       │   API_PURCHASEORDER_PROCESS_SRV           │
                                       │   API_BUSINESS_PARTNER                    │
                                       └──────────────────────────────────────────┘
```

### Key runtime facts

- **Transport:** HTTPS, JSON (`Accept: application/json`), service paths under `/sap/opu/odata/sap/<SERVICE>`.
- **Authentication:** OAuth 2.0 client credentials, bearer token, cached until 5 minutes before expiry.
- **Write protection:** SAP Gateway CSRF token + session cookie, refreshed once on HTTP 403.
- **Timeout / resilience:** 30 s request timeout, 3 attempts with 1 s / 2 s / 4 s backoff for **reads**, circuit breaker after 5 failures (half-open after 60 s). Writes are attempted **exactly once**.
- **Tenancy:** every function resolves a tenant and reads the tenant's `erp_configurations` row; database access uses the service role inside the function and JWT/RLS for clients.

---

## 3. Component inventory

| Component | Direction | Purpose | SAP APIs used | Primary tables |
|---|---|---|---|---|
| `erp-master-sync` | SAP → SmartStock | Scheduled/triggered master and stock baseline sync | `API_PRODUCT_SRV`, `API_BUSINESS_PARTNER`, `API_MATERIAL_STOCK_SRV` | `material_master`, `vendor_master`, `stock_baselines`, `sync_state`, `sync_audit_log`, `erp_configurations` |
| `sap-batch-sync` | SmartStock → SAP | Floor scrap/damage posting; emergency PO bypass (`execution_mode=IMMEDIATE`) | `API_MATERIAL_DOCUMENT_SRV` (`$batch`), `API_PURCHASEORDER_PROCESS_SRV` | `buffered_scraps`, `pending_replenishments`, `inventory_movements`, `live_inventory_ledger` |
| `erp-batch-execute` | SmartStock → SAP | Daily approved purchase-requisition batch, dry-run rehearsal, idempotency, DLQ | `API_PURCHASEREQ_PROCESS_SRV` (`$batch`) | `staged_prs`, `execution_batches`, `execution_batch_items`, `stores`, `live_inventory_ledger` |
| `erp-emergency-po` | SmartStock → SAP | Convert one approved staged PR into an emergency PO | `API_PURCHASEORDER_PROCESS_SRV` | `staged_prs`, `execution_batches` |
| `erp-goods-receipt` | SAP → SmartStock | Read material documents and match receipts to POs | `API_MATERIAL_DOCUMENT_SRV` (read) | `GoodsReceiptMatcher` tables (PO/GR matching) |
| `erp-reconciliation` | SAP ↔ SmartStock | Compare SAP unrestricted stock to local `inventory_position` read-model | `API_MATERIAL_STOCK_SRV` | `inventory_position`, `stores`, `sync_audit_log` |
| `sap-extractor` | SAP → SmartStock | Read-only extraction of purchasing info records and open POs (legacy path) | Direct OData GETs with `SAP_*` env credentials | info-record / order staging tables |
| Shared: `_shared/erp-adapter/*` | — | Contract, SAP/mock adapters, error taxonomy, factory | All of the above | — |
| Shared: `_shared/sync-engine/*` | — | Delta tracking, conflict resolution, audit | — | `sync_state`, `sync_audit_log` |
| Shared: `_shared/execution/*` | — | Idempotency, DLQ, batch helpers, GR matcher | — | `execution_batches`, dead-letter tables |

### Verified SAP service and entity contract

The adapter header (`sap-adapter.ts:1-49`) documents exactly which released OData V2 services are used:

| Service | Entity | Operation in SmartStock |
|---|---|---|
| `API_MATERIAL_DOCUMENT_SRV` | `A_MaterialDocumentHeader` | `POST` with deep insert navigation `to_MaterialDocumentItem`; `$batch`; `GET` with `$expand=to_MaterialDocumentItem` for goods receipts |
| `API_MATERIAL_STOCK_SRV` | `A_MaterialStock` | `GET` filtered by `Plant` (and `Material` for ATP), `$expand=to_MatlStkInAcctMod` |
| `API_PURCHASEORDER_PROCESS_SRV` | `A_PurchaseOrder` | `POST` with `to_PurchaseOrderItem` |
| `API_PURCHASEREQ_PROCESS_SRV` | `A_PurchaseRequisitionHeader` | `POST`; `$batch` with `to_PurchaseReqnItem` |
| `API_PRODUCT_SRV` | `A_Product` | `GET`, `$expand=to_Description`, optional `LastChangeDateTime` delta filter |
| `API_BUSINESS_PARTNER` | `A_Supplier` | `GET` supplier number/name |

The code deliberately does **not** use service names that do not exist in SAP's released list (e.g. `API_INVENTORY_TRANSACTION_SRV`, `API_PURCHASEORDER_SRV`, `A_GoodsMovementHeader`). Posting through those would fail.

---

## 4. Connectivity, authentication and request lifecycle

### 4.1 Configuration read

`AdapterFactory.getAdapterForTenant(tenantId, client)`:

1. Selects the active row from `erp_configurations` for the tenant.
2. Falls back to `MockAdapter` if none exists (development behaviour).
3. Constructs `SAPAdapter` for `erp_type` `sap_s4hana` or `sap_ecc`.

### 4.2 OAuth 2.0 client credentials

`SAPAdapter.getAccessToken()`:

- Token endpoint is `auth_config.token_url`, or `auth_config.cloud_connector_url + "/oauth/token"` when a Cloud Connector is configured.
- Request: `POST` form-encoded `grant_type=client_credentials` (+ optional `scope`), with HTTP Basic `client_id:client_secret`.
- Access token cached in memory and refreshed when fewer than 300 s remain.
- Failure raises `NonRetryableError` (bad credentials/configuration cannot be fixed by retrying).

### 4.3 CSRF token and session cookie

For any write (`sapRequest(..., { write: true })`):

1. `GET <serviceRoot>/` with `X-CSRF-Token: Fetch` and the bearer token.
2. SAP returns `x-csrf-token` and one or more `Set-Cookie` headers.
3. The token and cookie are cached per OData service root.
4. The write is sent with `X-CSRF-Token` and `Cookie`.
5. On HTTP 403 the cache is cleared, a new token is fetched once, and the write is retried once. Other failures are not retried.

### 4.4 Headers on every business request

```
Authorization: Bearer <access_token>
Accept: application/json
Content-Type: application/json      (multipart/mixed for $batch)
X-CSRF-Token: <token>               (writes only)
Cookie: <SAP session cookie>        (writes only)
```

The function-to-function layer uses Supabase JWTs and, where implemented, `requireAuth` (`_shared/security/require-auth.ts`) which accepts either a user JWT or the service-role/internal token for scheduled calls.

### 4.5 Error taxonomy (why this matters operationally)

`_shared/erp-adapter/errors.ts` defines four classes:

| Class | Meaning | Automatic retry? | Operator action |
|---|---|---|---|
| `NonRetryableError` | SAP answered with a definite rejection; no document exists | No | Correct the payload/master data and resubmit |
| `SapConfigurationError` | Missing/invalid configuration (plant, company code, purchasing group, token URL) | No | Fix configuration |
| `UnsupportedMovementError` | Movement cannot be mapped without inventing business data | No | Use the correct channel or supply explicit SAP mapping |
| `OutcomeUnknownError` | Request may have committed (timeout, dropped connection, HTTP 5xx, ambiguous `$batch`) | **Never** | Probe/reconcile in SAP, then resolve manually |

The retry wrapper (`base-adapter.ts`) retries reads up to 3 times with exponential backoff and opens a circuit breaker after 5 failures. `isOutcomeUnknown()` also classifies the literal `"Request timeout"` message as outcome-unknown because the in-flight fetch continues after the timeout race.

---

## 5. SAP-side requirements

This is the checklist an SAP Basis/security team must satisfy before go-live.

### 5.1 Platform and release assumptions

- SAP S/4HANA (on-premise, private cloud, or public cloud) exposing **OData V2** through SAP Gateway.
- SAP ECC is supported by the same adapter only where the same released OData V2 services are available; verify each service in the target release.
- No direct RFC, IDoc, or database connectivity is required or used.
- The services listed in §3 must be activated and reachable from the Supabase Edge runtime (or from the Cloud Connector).

### 5.2 Communication arrangement and user

Create a dedicated technical communication user (for example `SMARTSTOCK_INT`) with:

- Type **Communication User** (not a dialog user).
- OAuth 2.0 client credentials configured in the communication arrangement/scenario that contains the six services above.
- A client ID/secret issued to SmartStock; store them in `erp_configurations.auth_config` (secret-managed) — never in source control.
- Authorization to fetch a CSRF token for each service root (Gateway requires this for writes).
- Separate users/secrets per landscape (DEV, QA, PROD) and per tenant where required.

For on-premise systems behind SAP Cloud Connector, provide the Cloud Connector host/URL and confirm the OAuth token endpoint path; the adapter appends `/oauth/token` to `cloud_connector_url`.

### 5.3 OData services to activate

Use `/IWFND/MAINT_SERVICE` (or the communication arrangement) to activate and register:

1. `API_PRODUCT_SRV`
2. `API_MATERIAL_STOCK_SRV`
3. `API_MATERIAL_DOCUMENT_SRV`
4. `API_PURCHASEREQ_PROCESS_SRV`
5. `API_PURCHASEORDER_PROCESS_SRV`
6. `API_BUSINESS_PARTNER`

Verify with `GET /sap/opu/odata/sap/<SERVICE>/$metadata` using the integration user. The adapter does not inspect `$metadata`; it assumes the released contract.

### 5.4 Authorizations (validate names against the target release)

Authorization object names vary by release and activated business functions. The following are the typical objects a Basis/security team should review; treat them as guidance, not a substitute for an authorization trace (`ST01`) in the target system.

| Capability | Activity | Typical authorization objects to validate |
|---|---|---|
| Read material master | Display | `M_MATE_MAR`, `M_MATE_WRK`, `S_SERVICE` |
| Read stock / ATP | Display | `M_ISEG_*` (plant/storage), `S_SERVICE` |
| Create material documents (551, 501, 301) | Create/post | `M_MSEG_WMB` (plant), `M_MSEG_BWA` (movement type), `M_MSEG_LGO` (storage location), `M_MSEG_BWE` / goods-receipt objects as applicable |
| Create purchase requisitions | Create | `M_BANF_WRK`, `M_BANF_EKG`, `M_BANF_EKO`, `M_BANF_BSA` |
| Create purchase orders | Create | `M_BEST_WRK`, `M_BEST_EKG`, `M_BEST_EKO`, `M_BEST_BSA` |
| Read suppliers | Display | Business-partner display authorizations + `S_SERVICE` |
| Gateway service access | Execute | `S_SERVICE` for each service, Gateway routing authorizations |

Do **not** grant broad `SAP_ALL` or dialog-user roles. Restrict by company code, plant, purchasing organization, and movement type.

### 5.5 Master data and organisational prerequisites

The adapter refuses to invent any of these; each must exist and be mapped:

| Requirement | Where SmartStock expects it | Notes |
|---|---|---|
| Company code | `erp_configurations.company_code` or `metadata.sap_defaults.companyCode` | Mandatory for PR/PO |
| Purchasing organisation | `erp_configurations.purchasing_org` or `metadata.sap_defaults.purchasingOrganization` | Mandatory for PO; not derived from company code |
| Purchasing group | `erp_configurations.purchasing_group` or `metadata.sap_defaults.purchasingGroup` | Mandatory for PR/PO |
| Plant (`WERKS`) per store | `stores.sap_plant_code`, `erp_store_mappings.erp_plant`, or `metadata.plant_map` | Required for every stock/movement/PR/PO item |
| Storage location (`LGORT`) | Movement `storage_location`, ledger `sap_storage_loc`, or `metadata.sap_defaults.defaultStorageLocation` (falls back to `0001`) | Must exist for the plant |
| Materials (`MATNR`) | `material_master.sku` / SAP `Product` | Material must have the plant view and be valid for the plant |
| Vendors (`LIFNR`) | `vendor_master.vendor_code`, PO supplier | Vendor must be purchasable and not blocked |
| Units of measure | `material_master.base_uom`, movement/PR/PO `uom` | Must be a valid alternative/base UoM; no conversion is attempted |
| Batch numbers | Movement `batch` (optional) | Only sent when the material is batch-managed and the caller supplies it |
| Number ranges | SAP customising | Material documents (year-dependent), PR, PO number ranges must exist |
| Posting periods | SAP customising (MM) | Period must be open for the posting date |
| Release strategy | SAP customising | PR/PO may enter release workflow; SmartStock records only what SAP returns |
| Negative stock | SAP customising | Not overridden by SmartStock |
| MRP/ATP settings | Material plant data | `checkATP` reads unrestricted stock (`InventoryStockType = '01'`) |

### 5.6 Network and security

- Outbound HTTPS (443) from Supabase Edge Functions to the SAP Gateway or Cloud Connector.
- TLS certificate chain trusted by the runtime; no client certificate is used by the current OAuth flow (the `x509` method exists in the type model but is not implemented by `SAPAdapter`).
- Cloud Connector allow-list entries for the six service paths if on-premise.
- IP allow-listing / WAF rules on the SAP side if required by the customer.
- Rotate client secrets on a defined schedule and after any staff change.

### 5.7 Licensing and metering (SAP Digital Access)

SAP's Digital Access / document-based licensing counts business documents created through APIs. In this integration:

- Each material document created by `postInventoryMovements` is a separate SAP document, even though it is transported inside one OData `$batch`.
- Each purchase requisition and purchase order created is a separate document.
- Read-only calls (product, stock, supplier, goods-receipt read) do not create documents.

**Implication:** `$batch` is HTTP packaging only. It improves latency and atomicity, not licence consumption. Capacity planning must use the expected number of monthly postings, not the number of HTTP calls. Confirm the contract classification with SAP before pilot.

---

## 6. Configuration model

### 6.1 `erp_configurations` row (one active per tenant)

```jsonc
{
  "tenant_id": "<tenant-uuid>",
  "erp_type": "sap_s4hana",
  "erp_name": "SAP S/4HANA Production",
  "base_url": "https://sap-gw.example.com:44300",
  "auth_method": "oauth2",
  "auth_config": {
    "client_id": "<communication-user-client-id>",
    "client_secret_env": "SAP_PROD_CLIENT_SECRET",
    "token_url": "https://<ias-or-btp-host>/oauth/token",
    "scope": "<optional-scope>",
    "sap_client": "100"
  },
  "connection_status": "active",
  "company_code": "1000",
  "purchasing_org": "1000",
  "purchasing_group": "001",
  "metadata": {
    "sap_defaults": {
      "companyCode": "1000",
      "purchasingOrganization": "1000",
      "purchasingGroup": "001",
      "defaultStorageLocation": "0001",
      "currencyCode": "EUR"
    },
    "plant_map": {
      "store-uuid-or-code-1": "1001",
      "store-uuid-or-code-2": "1002",
      "*": "1001"
    },
    "sap_expands": {
      "material": "to_Plant",
      "vendor": "",
      "purchaseOrder": ""
    },
    "sap_field_map": {
      "material": { "ean_gtin": "EAN", "shelf_life_days": "ShelfLife" },
      "vendor": { "min_order_qty": "MinimumOrderQuantity" }
    }
  }
}
```

Notes:

- `metadata.sap_defaults` is required for procurement; missing `companyCode`/`purchasingGroup` raises `SapConfigurationError`.
- `metadata.plant_map` maps a SmartStock store reference to a SAP plant. Resolution order (`resolvePlant`):
  1. exact entry in `plant_map`;
  2. wildcard `plant_map["*"]`;
  3. a 3-digit numeric store ID is accepted as a plant with a warning;
  4. otherwise the write fails with `SapConfigurationError` — no silent default plant.
- `auth_config.client_secret_env` names a Supabase Edge secret. `AdapterFactory` resolves it at adapter construction; the plaintext secret is never stored in `erp_configurations`. Supplying `client_secret` directly is still accepted for legacy/dev configs, but is discouraged.
- `metadata.sap_client` (or `auth_config.sap_client`) is appended as `sap-client=<value>` to every Gateway request, including CSRF fetches and `$batch`.
- `metadata.sap_expands` are opt-in navigation names, validated as identifiers so configuration cannot inject OData syntax. `metadata.sap_field_map` maps SmartStock fields to release-specific SAP field names for material/vendor optional attributes; undeclared fields remain `undefined` rather than guessed.

### 6.2 Store and plant mapping

There are three supported sources, in practice:

1. `stores.sap_plant_code` — used by `erp-batch-execute` and `erp-reconciliation` to resolve a store to a plant.
2. `erp_store_mappings(tenant_id, store_id, erp_config_id, erp_plant, erp_storage_location)` — used by `erp-master-sync` to iterate stores for stock baselines.
3. `erp_configurations.metadata.plant_map` — used by the adapter's `resolvePlant` for movement/PR/PO postings.

Keep these consistent. A store with no plant mapping will fail closed at posting time.

### 6.3 Environment variables (Edge Functions)

| Variable | Used by | Purpose |
|---|---|---|
| `SUPABASE_URL` | All | Supabase project URL |
| `SUPABASE_ANON_KEY` | `sap-batch-sync`, auth flows | JWT verification client |
| `SUPABASE_SERVICE_ROLE_KEY` | All write paths | Server-side database access |
| `INTERNAL_SERVICE_TOKEN` | `requireAuth` | Optional service-to-service credential for schedulers |
| `SAP_GATEWAY_BASE_URL` | `sap-extractor` | Legacy read-only extraction |
| `SAP_BASIC_AUTH_TOKEN` | `sap-extractor` | Base64 basic-auth token (legacy) |
| `SAP_CLIENT_ID` | `sap-extractor` | Adds `&sap-client=<id>` to legacy URLs |

The modern adapter does not read `SAP_*` environment variables; it uses the tenant's `erp_configurations` row. This is what makes it multi-tenant.

### 6.4 How `sap-client` is handled

The OData adapter appends `sap-client=<value>` from `auth_config.sap_client` or `metadata.sap_client` to every Gateway request — ordinary reads, CSRF-token fetches, and `$batch` posts. The value is appended only when absent, and the URL is rejected as-is if it already carries a `sap-client`. A Cloud Connector path that fixes the client remains supported; in that case leave the config field empty.

---

## 7. End-to-end business flows

### 7.1 Inbound master data and stock baseline sync — `erp-master-sync`

Triggered by a scheduler or an authorised operator; entity types default to `material_master`, `vendors`, `stock_baselines`.

1. `requireAuth` + `resolveTenantScope`; a user's tenant comes from the verified JWT claim, never from the body or an unmatched `x-tenant-id` header (403 on mismatch).
2. Resolve tenant and active ERP config.
3. `adapter.healthCheck()`; if `down`, return 503 and do not start.
4. `SyncOrchestrator.runSync(job)` for each entity type:
   - `material_master`: `fetchMaterialMaster(since)` → compare → insert/update/conflict-resolve → audit.
   - `vendors`: `fetchVendors()` → same.
   - `stock_baselines`: read active `erp_store_mappings`, call `fetchStockBaselines(store_id)` per store with a bounded 5-worker pool, compare and upsert.
5. All list reads follow `@odata.nextLink`/`d.__next` (max 100 pages) rather than stopping at `$top`; a truncated result is never reported as complete.
6. Delta window comes from `sync_state`; first run falls back to the last 7 days.
7. Local rows are bulk-loaded by key set once per entity type, so comparison is no longer one query per ERP record.
8. A stock row without `erp_plant`, or a non-UUID `tenant_id`, is counted as a failed record with an explicit error — never written with a fabricated plant.
9. Conflicts are resolved by `ConflictResolver` (default `erp_wins`) and written to `sync_audit_log`.
10. `erp_configurations.connection_status`, `last_sync_at`, and `last_error_message` are updated.

**Stock baseline semantics (corrected in this branch):**

- The request expands `to_MatlStkInAcctMod`; without the expansion SAP returns no quantities.
- One `StockBaseline` row per SAP stock-type row.
- Stock-type mapping: `01` unrestricted, `02` quality inspection, `03` returns, `06` in transit, `07` blocked, `08` restricted-use, `10` GR blocked.
- `quantity_unrestricted` = row quantity for `01`; `quantity_in_quality_inspection` for `02`; `quantity_in_transit` for `06`; `quantity_blocked` for `07`/`10`.
- `atp_quantity` = row quantity for `01` only; QI/blocked/returns are not available to promise.
- Unmapped stock types are still returned with `stock_type` set and zero category quantities, so nothing is silently reclassified.

### 7.2 Outbound inventory movements — `sap-batch-sync` (floor scrap / damage)

Default path (`execution_mode` not `IMMEDIATE`):

1. Read pending rows from `buffered_scraps` (`sync_status = 'PENDING'`).
2. Map each row to an `InventoryMovement` of type `DAMAGE`, carrying the floor-captured `storage_location` and `sap_reason_code`.
3. `adapter.postInventoryMovements(movements)`:
   - `resolveMovement` maps `DAMAGE` → movement type `551`, goods movement code `03` (goods issue).
   - One changeset per document inside one `$batch`, so one rejection cannot roll back its neighbours.
   - Payload fields: `PostingDate`, `DocumentDate`, `GoodsMovementCode`, `MaterialDocumentHeaderText` (≤ 25 chars), `to_MaterialDocumentItem[{ Material, Plant, StorageLocation, GoodsMovementType, EntryUnit, QuantityInEntryUnit, Batch?, GoodsMovementReasonCode? }]`.
4. Parse each sub-response:
   - 2xx with `MaterialDocument` → success, capture `MaterialDocument` and `MaterialDocumentYear`.
   - 2xx without a document key → failure (never invent a number).
   - non-2xx → per-row failure with SAP message text.
   - sub-response count ≠ requested count → `OutcomeUnknownError` for the whole batch.
5. Only SAP-confirmed document numbers are passed to the `reconcile_sap_batch_sync(p_synced jsonb)` RPC, which updates the corresponding `buffered_scraps` rows and ledger state.
6. Simulated adapters never produce `sap_document_ids`, and never pass `confirmed` rows to reconciliation.

Supported default mappings:

| SmartStock movement | SAP movement type | GoodsMovementCode | Notes |
|---|---|---|---|
| `DAMAGE` | `551` | `03` | Scrap from unrestricted stock |
| `GOODS_RECEIPT` | `501` | `05` | GR without purchase order |
| `TRANSFER_OUT` | `301` | `04` | Requires `transfer_to_plant`; one-step plant-to-plant |
| `TRANSFER_IN` | — | — | Rejected: 301 already issues and receives |
| `SALE` | — | — | Rejected: must use sales document/delivery or POS integration |
| `GOODS_ISSUE` | — | — | Rejected: 201 needs cost centre/account assignment |
| `ADJUSTMENT` | — | — | Rejected: physical-inventory difference (701/702) belongs to `API_PHYSICAL_INVENTORY_DOC_SRV` |
| `COUNT` | — | — | Rejected: 701 not accepted by `API_MATERIAL_DOCUMENT_SRV` |
| Override | caller-supplied | caller-supplied | Either half may be supplied; the other is taken from the default map. Values validated as 3-digit movement type and `01`–`07` goods movement code. |

### 7.3 Procurement batch — `erp-batch-execute`

1. `requireAuth` (user JWT or service role). Anonymous calls are rejected.
2. Load tenant ERP config; refuse a real run against the mock adapter (409).
3. `healthCheck()`; 503 if the ERP is down.
4. Select approved `staged_prs` with `execution_mode = 'BATCH'` and no `erp_pr_number`.
5. Resolve each store to a plant via `stores.sap_plant_code`. If any plant is missing, fail the whole batch with 422 and list the staged PR IDs — no fallback plant.
6. Resolve optional storage location from `live_inventory_ledger.sap_storage_loc`.
7. Idempotency: `IdempotencyStore` hashes tenant + batch type + date + staged IDs and checks `execution_batches`. Already processed → 200 `already_processed`.
8. Insert an `execution_batches` row (`running`).
9. **Dry run** (`dry_run: true`): record the batch as `success` with zero items, return the planned items, write no PR and no number.
10. Execute:
    - `adapter.executeBatchPR(items)` → one `$batch`, one changeset per PR, payload from `buildPurchaseRequisitionPayload`:
      `PurchaseRequisitionType: 'NB'`, `PurReqnDescription`, `to_PurchaseReqnItem[{ PurchaseRequisitionItem: '10', Material, Plant, CompanyCode, PurchasingGroup, RequestedQuantity, BaseUnit, Price? }]`.
    - If the adapter has no batch method, fall back to one `postPurchaseRequisition` per item.
11. On `OutcomeUnknownError`: mark the batch failed, leave the PRs `approved`, return 409 with explicit manual-reconciliation instructions. No automatic retry.
12. For each item: a success **requires** a returned PR number; otherwise it is recorded as failed and enqueued to the DLQ for business/validation errors.
13. Update `staged_prs` (`submitted_to_erp`, `erp_pr_number`), `execution_batch_items`, and final batch status (`success` / `partial_success` / `failed`).

**PR payload constraints:**

- One item per PR in `postPurchaseRequisition`; multi-item requisitions are supported only through `executeBatchPR`.
- A plant is mandatory.
- A missing estimated price is omitted, not sent as zero.
- Company code and purchasing group come from `metadata.sap_defaults` or the first-class columns; missing values fail closed.
- Purchasing organisation is not required for a PR payload in this implementation but is mandatory for a PO.

### 7.4 Emergency purchase order — `erp-emergency-po`

1. Load the staged PR by `staged_pr_id`.
2. Build a `PurchaseOrder` with `po_type = 'NB'`, vendor, one item, plant, net price, delivery date.
3. `adapter.postEmergencyPO(po)` → SAP adapter delegates to `postPurchaseOrder`.
4. `postPurchaseOrder` refuses `po_type = 'UB'` (stock transport order) rather than substituting a normal PO.
5. Requires company code, purchasing organisation, purchasing group, vendor, plant, and a non-zero item list.
6. Records an `execution_batches` row of type `EMERGENCY_PO`.
7. Returns only the PO number SAP returned; no synthesis.

The function requires an authenticated caller and scopes the staged PR by the verified tenant. Only a PO number actually returned by SAP is recorded; no `SAP-PO-…` fallback is generated.

### 7.5 Goods receipt ingest — `erp-goods-receipt`

1. `adapter.fetchGoodsReceipts(since)` reads `A_MaterialDocumentHeader` with `$expand=to_MaterialDocumentItem` (optionally filtered by `PostingDate`).
2. Flattens each item into a `GoodsReceipt` carrying `erp_gr_number`, `erp_gr_year`, `erp_po_number`, `erp_po_item`, material, plant, storage location, quantity, UoM, batch, and posting date.
3. `GoodsReceiptMatcher` matches each receipt against the local PO/GR state and reports matched/unmatched and variance.

### 7.6 Stock reconciliation — `erp-reconciliation`

The adapter is deliberately stateless. Reconciliation is a join performed by the edge function:

1. `adapter.reconcileStock(store_id, sku?)` fetches SAP stock baselines and returns:
   - `erp_total` = sum of `quantity_unrestricted` (optionally filtered by SKU);
   - per-SKU `discrepancies` with `erp_qty`, and `local_qty = 0` / `diff = 0` placeholders;
   - `local_total = 0` with an explicit comment that the caller must supply it.
2. The edge function requires a UUID tenant (422 otherwise) and resolves the store reference before any ERP work:
   - a UUID is treated as `inventory_position.location_id`;
   - a plant code is resolved through `stores.sap_plant_code → stores.id`;
   - an unresolvable `store_id` returns 422 instead of silently skipping the local side and reporting a zero variance.
3. It reads `inventory_position` for that location, sums `sellable_qty`, and computes:
   - `local_total`, `variance = local_total − erp_total`, `variance_percentage`;
   - fills each discrepancy's `local_qty` and `diff = local_qty − erp_qty`.
4. `local_side_status` is `ok`, `unavailable`, or `not_scoped`. A failed read is surfaced explicitly; no variance is claimed.
5. Only a computed variance above 0.01 is written to `sync_audit_log` as a `CONFLICT` with `conflict_strategy = 'erp_wins'` and a recommendation (physical audit if > 5 %).

### 7.7 Batch posting ledger reconciliation

`sap-batch-sync` calls the SQL function `reconcile_sap_batch_sync(p_synced jsonb)`. The current definition (migration `73_sap_reconciliation_integrity.sql`) only reconciles rows explicitly supplied by the caller and refuses to invent confirmations. This replaced the earlier version that reconciled rows without SAP-confirmed document numbers.

---

## 8. Business task → mechanism → SAP artefact

| Business task | SmartStock entry point | Mechanism | SAP artefact |
|---|---|---|---|
| Keep material, vendor, stock data current | `erp-master-sync` | Delta/full pull + conflict resolution + audit | `A_Product`, `A_Supplier`, `A_MaterialStock` |
| Write off damaged/expired stock | `sap-batch-sync` (batch) | 551 goods issue per item inside `$batch` | Material document |
| Record a receipt without a PO | `sap-batch-sync` (GOODS_RECEIPT movement) | 501 goods receipt | Material document |
| Move stock between plants | `sap-batch-sync` (`TRANSFER_OUT` with target plant) | 301 one-step transfer | Material document |
| Replenish through procurement (planned) | `erp-batch-execute` | Approved PRs → SAP PR `$batch` | Purchase requisition |
| Replenish urgently | `erp-emergency-po` / `sap-batch-sync` IMMEDIATE | Direct PO creation | Purchase order |
| Match deliveries to POs | `erp-goods-receipt` | Read material documents + matcher | Material document |
| Detect SAP-vs-local stock divergence | `erp-reconciliation` | ERP total + local `inventory_position` join | `A_MaterialStock` + local read-model |
| Check availability before promising stock | adapter `checkATP` | Unrestricted stock sum for material/plant | `A_MaterialStock` |
| Trace every change | `sync_audit_log`, `execution_batches`, `execution_batch_items` | Audit writes on every sync/execution | — |

---

## 9. Field and code mapping reference

### 9.1 Domain ↔ SAP

| SmartStock field | SAP field/entity | Notes |
|---|---|---|
| `MaterialMaster.sku` / `erp_material_number` | `A_Product.Product` (`MATNR`) | Trimmed/leading zeros are SAP's responsibility; the adapter sends the value verbatim |
| `description` | `to_Description.ProductDescription` | First description only |
| `material_group` | `ProductGroup` (`MATKL`) | |
| `base_uom` / `sales_uom` | `BaseUnit`, `SalesUnit` | Sales UoM is only read when declared via `metadata.sap_field_map`; otherwise falls back to base UoM |
| `erp_plant` | `Plant` (`WERKS`) | |
| `erp_storage_location` | `StorageLocation` (`LGORT`) | Falls back to configured default then `0001` |
| `quantity_unrestricted` | `to_MatlStkInAcctMod.MatlWrhsStkQtyInMatlBaseUnit` where stock type `01` | |
| `quantity_in_quality_inspection` | same quantity where stock type `02` | |
| `quantity_blocked` | same quantity where stock type `07` or `10` | |
| `quantity_in_transit` | same quantity where stock type `06` | |
| `atp_quantity` | stock type `01` quantity | ATP is unrestricted only |
| `InventoryMovement.quantity` | `QuantityInEntryUnit` | Sent as absolute value; direction is encoded by movement type |
| `InventoryMovement.uom` | `EntryUnit` | No conversion |
| `reference_date` | `PostingDate` / `DocumentDate` | Formatted `YYYY-MM-DDT00:00:00` |
| `external_reference` / `reference_document` / `movement_id` | `MaterialDocumentHeaderText` | Hashed to a deterministic `SS-<hash>-<hint>` string (≤ 25 chars) so `getPostingStatus` can probe SAP |
| `storage_location` | `StorageLocation` | |
| `batch` | `Batch` | Optional |
| `sap_reason_code` | `GoodsMovementReasonCode` | Optional |
| `transfer_to_plant` | `IssuingOrReceivingPlant` | Required for 301 |
| `transfer_to_storage_location` | `IssuingOrReceivingStorageLoc` | Optional for 301 |
| `PurchaseRequisition` | `PurchaseRequisitionHeader` | Type `NB` |
| PR item material/plant/qty/UoM | `Material`, `Plant`, `RequestedQuantity`, `BaseUnit` | |
| PR price | `PurchaseRequisitionPrice` + `PurReqnPriceQuantity = 1` | Omitted when unknown |
| `PurchaseOrder` header | `CompanyCode`, `PurchaseOrderType`, `Supplier`, `DocumentCurrency`, `PurchasingOrganization`, `PurchasingGroup` | Type `NB` only |
| PO item | `Material`, `Plant`, `OrderQuantity`, `PurchaseOrderQuantityUnit`, `NetPriceAmount`, `NetPriceQuantity = 1` | Item numbers `00010`, `00020`, … |

### 9.2 Goods movement codes (SAP KBA 3333223)

`01` GR for PO · `02` GR for production order · `03` goods issue · `04` transfer posting · `05` other goods receipt · `06` reversal · `07` subsequent adjustment (subcontracting).

### 9.3 Inventory stock types (NSDM_LBBSA)

`01` unrestricted-use · `02` quality inspection · `03` returns · `04` transfer (storage location) · `05` transfer (plant) · `06` in transit · `07` blocked · `08` restricted-use · `09` tied empties · `10` GR blocked.

---

## 10. Integrity and safety controls

| Control | Implementation | Why it matters |
|---|---|---|
| No synthetic document numbers | `postPurchaseRequisition`, `postPurchaseOrder`, `parseMaterialDocumentBatch`, `sap-batch-sync` | A fake number would close a job whose document never reached SAP |
| Simulated adapter guard | `adapter.simulated` checks in `sap-batch-sync`, `erp-batch-execute` | Mock runs must not look like real SAP activity |
| Write-once semantics | Writes bypass `withRetry`; only the 403 CSRF refresh is retried | Prevents duplicate metered documents |
| Outcome-unknown quarantine | `OutcomeUnknownError`, `erp-batch-execute` 409 path | Forces human reconciliation before any re-run |
| Deterministic posting probe | `SS-<hash>-<hint>` BKTXT + `getPostingStatus()` in `posting-worker` | A CONFIRMED probe closes the outbox job with SAP's own document number; NOT_FOUND/FAILED stay human-owned |
| Transport-failure honesty | `isTransportFailure()` on PR/PO writes | A dropped HTTP response is reported as outcome-unknown, not `success: false` |
| Auth + tenant scoping | `requireAuth` + `resolveTenantScope` on every ERP-facing function | A user JWT for tenant A cannot assert tenant B; anonymous callers cannot create SAP documents |
| Batch cardinality check | Sub-response count must equal requested count | Positional mapping is unsafe if counts differ |
| Strict movement mapping | `resolveMovement` + validation | A wrongly posted 201 would misstate COGS |
| STO refusal | `postPurchaseOrder` rejects `po_type = 'UB'` | A plain PO would look like an STO but move no stock |
| Plant fail-closed | `resolvePlant`, `erp-batch-execute` 422 | Prevents silently posting to the wrong site |
| Idempotent PR batch | `IdempotencyStore` + `execution_batches.idempotency_key` | Prevents same-day duplicate requisitions |
| DLQ | `DeadLetterQueue` on business/validation errors | Keeps poison items visible and replayable |
| Local/ERP reconciliation separation | Stateless adapter + caller join | Variance reflects real data, not a fabricated zero |

---

## 11. Operations runbook

### 11.1 Recommended schedule

| Job | Suggested cadence | Invocation |
|---|---|---|
| `erp-master-sync` (delta) | Every 15–60 min | Scheduler with service token/JWT |
| `sap-batch-sync` (floor scrap) | Every 5–15 min or after shift close | Scheduler |
| `erp-batch-execute` (approved PRs) | Daily, after approval cut-off | Scheduler with `dry_run` rehearsal first |
| `erp-goods-receipt` | Hourly / several times per day | Scheduler |
| `erp-reconciliation` | Daily after SAP posting close | Scheduler |
| `erp-emergency-po` | On demand | Authorised user action |

Example invocation (replace host and token):

```bash
curl -X POST "https://<project>.supabase.co/functions/v1/erp-batch-execute" \
  -H "Authorization: Bearer <user-jwt-or-service-role>" \
  -H "x-tenant-id: <tenant-uuid>" \
  -H "Content-Type: application/json" \
  -d '{"dry_run": true}'
```

### 11.2 Health and telemetry

- `erp_configurations.connection_status`, `last_sync_at`, `last_error_message`, `last_health_check_at`.
- `sync_state` per entity type (`last_sync_at`, `last_record_timestamp`, counts).
- `sync_audit_log` for inserts/updates/conflicts, including reconciliation conflicts.
- `execution_batches` / `execution_batch_items` for procurement outcomes and idempotency.
- Dead-letter tables for business/validation failures.
- Edge Function logs: `[sap-adapter]`, `[erp-batch-sync]`, `[erp-batch-execute]`, `[erp-reconciliation]`.
- SAP side: Gateway error log (`/IWFND/ERROR_LOG`), application log, material document/PR/PO created in the target client.

### 11.3 Incident playbooks

| Symptom | Likely cause | Action |
|---|---|---|
| 401 from SmartStock function | Missing/expired JWT | Re-authenticate; scheduler must use service token |
| 401/403 from SAP token endpoint | Wrong client/secret, scope, or communication arrangement | Validate `auth_config`, re-issue secret |
| `SapConfigurationError` | Missing plant/company code/purchasing group | Fix `erp_configurations` or store mapping; do not bypass |
| HTTP 400 from SAP on a movement | Closed posting period, invalid material/plant, missing account assignment, number range | Read the SAP message, correct master data, resubmit |
| HTTP 5xx or timeout on a write | Commit state unknown | **Do not retry**; search SAP for the document/reference, reconcile, then decide |
| `$batch` sub-response count mismatch | Gateway truncation/proxy interference | Treat as outcome-unknown; inspect SAP documents individually |
| Circuit breaker open | Five consecutive read failures | Wait 60 s or fix connectivity; check Gateway availability |
| Reconciliation variance | Missed events, timing, returns/QI stock, mapping error | Review `discrepancies`, check stock type coverage, run physical audit if > 5 % |
| DLQ items accumulating | Business validation errors | Correct staging data, replay from DLQ |

### 11.4 Digital Access monitoring

Track monthly counts of material documents, PRs, and POs created in SAP against the contract. Alert on unexpected spikes (for example a retry loop or a misconfigured scheduler). Because `$batch` does not reduce document count, cost scales with postings, not requests.

---

## 12. Security and multi-tenancy

- **Caller authentication:** `requireAuth` accepts a Supabase user JWT (verified with `auth.getUser`) or the service-role/internal token where `allowService` is set. `sap-batch-sync` performs an equivalent explicit JWT check.
- **Tenant resolution:** `x-tenant-id` header, request body, or user metadata, in that order, with a `default-tenant` fallback. In production, the header must be set by a trusted gateway; do not expose functions directly to browsers without it.
- **Database RLS:** tenant isolation policies compare against `auth.jwt()` claims. Recent migrations wrap `auth.jwt()` in `(select …)` for per-query evaluation.
- **Service role:** used inside functions for staging/audit writes. It bypasses RLS by design; functions must therefore enforce tenant scoping in code.
- **Secrets:** `auth_config.client_secret` must be stored using Supabase Vault or an equivalent encrypted mechanism. Do not rely on the JSONB column alone.
- **Least privilege in SAP:** dedicated communication users, plant/purchasing-org restrictions, no dialog or `SAP_ALL` roles.
- **Auditability:** every sync and execution writes to `sync_audit_log` / `execution_batches`; SAP-side document history remains the system of record for postings.

---

## 13. Testing and go-live

### 13.1 Five-gate progression (existing strategy)

1. **Stateful mock SAP** — full local simulation of the OData V2 contracts and failure scenarios (`MockAdapter`).
2. **SAP API Business Hub** — payload validation against official `$metadata`.
3. **Customer DEV/QA** — read/write with dedicated test plants and materials.
4. **Pilot UAT** — KPI baseline across a pilot store cluster.
5. **Production** — controlled multi-store rollout with Digital Access monitoring.

### 13.2 Minimum UAT checklist

- [ ] OAuth token issued; `healthCheck` returns `healthy`.
- [ ] `fetchMaterialMaster` returns active materials with descriptions and base UoM.
- [ ] `fetchVendors` returns suppliers with names.
- [ ] `fetchStockBaselines` returns non-zero unrestricted quantities and correct stock-type split.
- [ ] One 551 scrap posts a material document; the returned number matches SAP.
- [ ] One 501 receipt posts and is visible in SAP.
- [ ] One 301 transfer posts with the receiving plant.
- [ ] An unsupported movement (`SALE`, `GOODS_ISSUE`, `ADJUSTMENT`, `COUNT`) is rejected with a clear error.
- [ ] A PR dry run returns planned items and writes no number.
- [ ] A real PR batch creates PRs; numbers match SAP; `staged_prs` is updated.
- [ ] Re-running the same PR batch returns `already_processed`.
- [ ] Emergency PO creates a PO; an STO request is refused.
- [ ] Goods-receipt read matches a known material document.
- [ ] Reconciliation identifies a deliberately introduced variance and logs it.
- [ ] A forced timeout/5xx leaves the batch in `outcome_unknown` and no auto-retry occurs.
- [ ] `getPostingStatus()` finds the `SS-<hash>-<hint>` document that was actually posted; `posting-worker` closes the outbox job with SAP's number.
- [ ] An anonymous call and a cross-tenant `x-tenant-id` are rejected (401/403).
- [ ] A catalog larger than one OData page is read completely via `@odata.nextLink`.
- [ ] Digital Access counts match the number of documents created.

### 13.3 Deployment shape

- Deploy the relevant Edge Functions: `erp-master-sync`, `sap-batch-sync`, `erp-batch-execute`, `erp-emergency-po`, `erp-goods-receipt`, `erp-reconciliation`, `sap-extractor`, plus shared modules (bundled automatically).
- Apply migrations in order, including `15_erp_config.sql`, `33_inventory_position.sql`, and `73_sap_reconciliation_integrity.sql`.
- Seed one `erp_configurations` row, `stores.sap_plant_code`, and `metadata.plant_map` per tenant before the first write.
- Start with `dry_run: true` for procurement and a single pilot store/plant.

---

## 14. Previously identified limitations — resolution status

All twenty items in the earlier audit have been addressed in code. This section records what changed so reviewers can verify each one; remaining items are external SAP-side dependencies, not application gaps.

### 14.1 Security — resolved

1. **Auth guards** — `erp-master-sync`, `erp-goods-receipt`, `erp-emergency-po`, and `erp-reconciliation` now call `requireAuth`. `erp-batch-execute`, `sap-batch-sync`, `sap-extractor`, and `posting-worker` were already guarded. Every ERP-facing function rejects anonymous callers.
2. **Tenant assertion** — user tenants are derived from verified JWT claims (`user_metadata`, then `app_metadata`). `requireAuth` returns 403 when `x-tenant-id` disagrees with the claim, and `resolveTenantScope` prevents a JSON-body `tenant_id` from overriding it. Service callers may assert a tenant via the header.
3. **Secret storage** — `auth_config.client_secret_env` names a Supabase Edge secret; `AdapterFactory` resolves it at construction and never writes the plaintext back to `erp_configurations`. Legacy inline `client_secret` still works but is discouraged. Rotation is now an Edge-secret operation, not a database update.

### 14.2 Functional — resolved

4. **Posting-status probe** — material documents carry a deterministic `SS-<hash>-<hint>` header text derived from `external_reference` / `reference_document` / `movement_id`. `getPostingStatus()` recomputes it and queries `A_MaterialDocumentHeader`; `posting-worker` uses a CONFIRMED result to close an `OUTCOME_UNKNOWN` job with SAP's own document number. NOT_FOUND and FAILED remain human-owned — no auto-retry.
5. **PO reads** — `fetchPurchaseOrders` now reads `API_PURCHASEORDER_PROCESS_SRV/A_PurchaseOrder` with `to_PurchaseOrderItem`, maps header and item fields, derives status, and supports vendor/plant/since filters (with in-memory fallback when the release cannot filter).
6. **Material master fields** — sales UoM, EAN/GTIN, shelf life, rounding value, MOQ, standard price, and vendor accounts are read when present. Release-specific navigation and field names are declared in `metadata.sap_expands` / `metadata.sap_field_map`; nothing is guessed.
7. **Vendor master fields** — currency, MOQ, rounding, and contract net price are read through the same opt-in field map. Info-record-only values stay 0/undefined unless the customer maps them.
8. **Pagination** — all list reads use a shared `fetchAll()` that follows `d.__next` / `@odata.nextLink`, caps at 100 pages, and refuses to follow a nextLink pointing at a different host.
9. **Stock read limit** — `A_MaterialStock` reads now page through all results; the previous 5,000-row ceiling is gone. ATP and reconciliation inherit this.
10. **`sap-client`** — the configured value is appended to every Gateway request, including CSRF fetches and `$batch`.
11. **Write failures** — transport failures in `postPurchaseRequisition` and `postPurchaseOrder` now raise `OutcomeUnknownError` instead of `{ success: false }`; definite SAP rejections and configuration errors remain non-retryable failures.
12. **`executeBatchPR`** — checks the circuit breaker before sending, records outcome/failure counters, and converts transport failures to `OutcomeUnknownError`. It still never retries a write.
13. **Unsupported movements** — remain intentionally refused, but `capabilities()` now advertises `supportedMovementTypes` and `unsupportedMovementGuidance`, and an explicit `sap_movement_type` + `sap_goods_movement_code` override is validated and accepted for customer-specific processes. Sales, count differences, and STOs still need their proper SAP APIs; the adapter never substitutes a plain PO for an STO.
14. **Reconciliation mapping** — an unresolvable `store_id` returns 422, a non-UUID tenant returns 422, and audit rows use the real active `erp_config_id`. Failed local reads are surfaced through `local_side_status`.
15. **Admin integration UI** — health cards now read `erp_configurations` (`connection_status`, `last_health_check_at`, `last_sync_at`, `last_error_message`), `pos_feed_health`, and `integration_outbox` counts. Unknown values show "No telemetry available"/"Latency not recorded"; the Probe button re-fetches real data.

### 14.3 Data model — resolved

16. **UUID tenants** — the sync orchestrator and reconciliation reject non-UUID tenants before writing to UUID columns; `default-tenant` can no longer be written into `sync_state`, `stock_baselines`, or `sync_audit_log`.
17. **Stock-type semantics** — the adapter, types, mock adapter, and this document now consistently use `NSDM_LBBSA` (`01` unrestricted, `02` QI, `03` returns, `06` in transit, `07` blocked, `10` GR blocked). No downstream code referenced the old `02 = blocked` mapping.
18. **No fabricated plant** — `SyncOrchestrator` no longer defaults `erp_plant`, storage location, or UoM; a stock row without `erp_plant` is counted as a failed record with an explicit error.

### 14.4 Performance and scale — resolved

19. **Bounded parallelism** — per-store stock fetches use a five-worker pool with deterministic result ordering and per-store error isolation.
20. **No N+1** — local records are bulk-loaded by key set (chunks of 200) into Maps before comparison; material IDs and the default store are preloaded once.

### 14.5 Residual external dependencies

These need SAP-side configuration or a different SAP API; they are not defects in the integration code:

- `API_PHYSICAL_INVENTORY_DOC_SRV` must be activated if count/adjustment differences are to be posted.
- Sales and STO flows need their respective sales/stock-transport APIs; the adapter deliberately does not implement them by guessing a document type.
- MOQ, rounding, and contract price require purchasing info records exposed through `metadata.sap_field_map` or a customer CDS view; supplier master alone does not carry them.
- Digital Access licensing and authorization objects must still be validated in the target release (§5.4, §5.7).

---

## 15. Appendix

### 15.1 Glossary

| Term | Meaning |
|---|---|
| `WERKS` | SAP plant |
| `LGORT` | SAP storage location |
| `MATNR` | SAP material number |
| `LIFNR` | SAP supplier/vendor number |
| `MJAHR` | Material document year |
| `BKTXT` | Material document header text (25 chars) |
| `NSDM_LBBSA` | Inventory stock type domain |
| `NB` | Standard purchase order / requisition document type |
| `UB` | Stock transport order document type |
| `ATP` | Available-to-promise |
| `DLQ` | Dead-letter queue |
| `RLS` | PostgreSQL row-level security |

### 15.2 Material document payload (scrap, 551)

```json
{
  "PostingDate": "2026-11-22T00:00:00",
  "DocumentDate": "2026-11-22T00:00:00",
  "GoodsMovementCode": "03",
  "MaterialDocumentHeaderText": "SS-9f2c1a4b-SCRAP12345",
  "to_MaterialDocumentItem": [
    {
      "Material": "10000001",
      "Plant": "1001",
      "StorageLocation": "0001",
      "GoodsMovementType": "551",
      "EntryUnit": "PC",
      "QuantityInEntryUnit": "6",
      "GoodsMovementReasonCode": "0001"
    }
  ]
}
```

### 15.3 Purchase requisition payload

```json
{
  "PurchaseRequisition": "",
  "PurchaseRequisitionType": "NB",
  "PurReqnDescription": "SmartStock replenishment",
  "SourceDetermination": false,
  "PurReqnDoOnlyValidation": false,
  "to_PurchaseReqnItem": {
    "results": [
      {
        "PurchaseRequisitionItem": "10",
        "PurchaseRequisitionItemText": "10000001",
        "Material": "10000001",
        "Plant": "1001",
        "CompanyCode": "1000",
        "PurchasingGroup": "001",
        "RequestedQuantity": "48",
        "BaseUnit": "PC",
        "PurchaseRequisitionPrice": "1.25",
        "PurReqnPriceQuantity": "1",
        "to_PurchaseReqnAcctAssgmt": { "results": [] },
        "to_PurchaseReqnDeliveryAddress": {},
        "to_PurchaseReqnItemText": { "results": [] }
      }
    ]
  }
}
```

### 15.4 Purchase order payload

```json
{
  "CompanyCode": "1000",
  "PurchaseOrderType": "NB",
  "Supplier": "V001",
  "DocumentCurrency": "EUR",
  "PurchasingOrganization": "1000",
  "PurchasingGroup": "001",
  "to_PurchaseOrderItem": [
    {
      "PurchaseOrderItem": "00010",
      "PurchaseOrderItemText": "10000001",
      "Material": "10000001",
      "Plant": "1001",
      "OrderQuantity": "48",
      "PurchaseOrderQuantityUnit": "PC",
      "NetPriceAmount": "1.25",
      "NetPriceQuantity": "1"
    }
  ]
}
```

### 15.5 Code map

| Concern | File |
|---|---|
| Adapter contract and types | `supabase/functions/_shared/erp-adapter/types.ts` |
| SAP OData implementation | `supabase/functions/_shared/erp-adapter/sap-adapter.ts` |
| Mock implementation | `supabase/functions/_shared/erp-adapter/mock-adapter.ts` |
| Retry, timeout, circuit breaker, batch result | `supabase/functions/_shared/erp-adapter/base-adapter.ts` |
| Error taxonomy | `supabase/functions/_shared/erp-adapter/errors.ts` |
| Adapter selection | `supabase/functions/_shared/erp-adapter/factory.ts` |
| Inbound sync orchestration | `supabase/functions/_shared/sync-engine/sync-orchestrator.ts` |
| Idempotency / DLQ / GR matching | `supabase/functions/_shared/execution/` |
| Caller authentication | `supabase/functions/_shared/security/require-auth.ts` |
| ERP configuration schema | `supabase/migrations/15_erp_config.sql` |
| Inventory position read-model | `supabase/migrations/33_inventory_position.sql` |
| Batch ledger reconciliation | `supabase/migrations/73_sap_reconciliation_integrity.sql` |

---

*This document reflects the implementation on branch `fix/pos-webhook-integration-audit` as of 2026-11-22. Update it whenever the adapter contract, SAP service list, or configuration schema changes.*
