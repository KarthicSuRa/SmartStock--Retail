# Planning engine governance and safety rules

This document describes the current behaviour of the replenishment intelligence layer after the correctness/safety fixes. It is intentionally blunt about what the engine does not do: **there is no trained forecasting model yet**. The engine is a transparent, rule-based planner with explicit data-quality gates.

## 1. Where the logic lives

| Concern | File |
|---|---|
| Sales velocity and demand CV | `supabase/functions/_shared/reorder-engine/velocity-calculator.ts` |
| Weather / holiday / promotion factors | `supabase/functions/_shared/reorder-engine/context-multipliers.ts` |
| Safety stock and reorder point | `supabase/functions/_shared/reorder-engine/safety-stock-formula.ts` |
| STO vs external sourcing | `supabase/functions/_shared/reorder-engine/sto-optimizer.ts` |
| Staged PR creation | `supabase/functions/_shared/reorder-engine/procurement-generator.ts` |
| Orchestration and guards | `supabase/functions/reorder-engine/index.ts` |
| Context cache refresh | `supabase/functions/contextual-sync/index.ts` |
| Governance columns | `supabase/migrations/77_reorder_governance.sql` |

## 2. Correctness rules now enforced

1. **No NaN decisions.** Safety stock uses `demandCoefficientOfVariation` (real demand variability from the velocity calculator) and `leadTimeVariabilityPct`. Invalid inputs throw instead of producing `NaN`.
2. **Correct variance formula.** `Var = (L+R)·σ_d² + d²·σ_L²`, where `σ_d = d·CV` and `σ_L = L·leadTimeCV`. This combines demand and lead-time uncertainty instead of inventing a single 20% figure.
3. **No double-counting.** Order-up-to target = `coverageDemand + safetyStock`, minus on-hand stock and minus quantities already on open staged PRs.
4. **No invented vendor or price.** If there is no active purchasing-info record with a vendor code, currency, positive lead time and positive contract price, the recommendation is blocked. `VEND-DEFAULT` / `Primary Wholesale Vendor` no longer exist.
5. **No fabricated context.** Without `OPENWEATHER_API_KEY`, no weather rows are written. Holidays come from Nager.Date with **neutral uplift 1.0** — a calendar supplies dates, not commercial uplift. Promotions require a configured `PROMOTION_FEED_URL` and a recent `synced_from_erp_at`; stale rows are ignored.
6. **Bounded multipliers.** Only applied factors multiply demand; missing/stale factors are neutral and recorded. Composite is clamped to `0.5–3.0`.
7. **Opt-in automation.** `auto_reorder` must be explicitly `true` on the store-material config. Critical alerts are not auto-released unless `auto_release_critical` is explicitly enabled.
8. **Confidence gate.** Auto-staging requires an inventory confidence score at or above `min_confidence_score` (default 70) and no unreliable context signals.
9. **Human gate for STOs.** STO recommendations are never auto-staged; the SAP adapter refuses UB purchase orders.
10. **Auditable recommendations.** Every alert stores `forecast_explanation`, `model_version`, `confidence_score`, `data_quality`, `inbound_qty` and any `blocked_reason` in `reorder_alerts`.

## 3. Authentication

`reorder-engine`, `contextual-sync` and `calculate-velocity` now use `requireAuth` + `resolveTenantScope`. User callers cannot override their tenant through a request body or an unmatched `x-tenant-id` header. Service callers are allowed for scheduled invocation.

## 4. Forecast layer (phase 2)

- `demand-forecast` generates **P50 and P90** store-material-day forecasts with a deterministic seasonal-EWMA baseline (`_shared/forecast/baseline-forecaster.ts`), censoring stockout days and applying validated context factors.
- Each run performs a 14-day **out-of-sample backtest** and records WAPE, bias, P90 coverage and a naive-baseline comparison. A model that does not beat the naive baseline or misses P90 coverage is marked `DRIFT`.
- `forecast-evaluation` measures **matured** forecasts against actual sales and writes `forecast_accuracy`; `DRIFT` blocks automation.
- `reorder-engine` uses the quantile forecast **only** when its accuracy is within threshold; otherwise it falls back to the statistical z-score formula and says so in `forecast_source`.
- Schema: migration `78_demand_forecasting.sql` (`demand_forecasts`, `forecast_accuracy`).

## 5. What is still missing (do not overclaim)

- No trained ML model. The baseline is deliberately transparent and must be beaten by any future model.
- No learning of promotion/holiday uplift from actual sales; configured uplift values are reused.
- No ABC/XYZ-driven per-SKU service levels.
- No auto-replenishment without human approval; this is deliberate.

A recommendation from this engine is a **suggestion with evidence**, not an autonomous buyer.

## 6. Tests

```bash
npx -y deno test --no-lock --node-modules-dir=auto \
  supabase/functions/_shared/reorder-engine/reorder-safety.test.ts \
  supabase/functions/_shared/forecast/baseline-forecaster.test.ts
```

They verify finite safety stock, fail-fast validation, neutral handling of missing signals, stale-promotion rejection, multiplier capping, finite P50/P90 forecasts, stockout censoring, and sparse-history behaviour.
