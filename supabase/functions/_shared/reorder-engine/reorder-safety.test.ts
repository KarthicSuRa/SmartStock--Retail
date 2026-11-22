// Tests for the safety guardrails in the planning engine.
// Run: npx -y deno test --no-lock --node-modules-dir=auto supabase/functions/_shared/reorder-engine/reorder-safety.test.ts

import { assertEquals, assert, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { SafetyStockFormula, SafetyStockInput } from "./safety-stock-formula.ts";
import { ContextMultipliers } from "./context-multipliers.ts";

const baseInput: SafetyStockInput = {
  forecastVelocityDaily: 10,
  leadTimeDays: 7,
  demandCoefficientOfVariation: 0.3,
  leadTimeVariabilityPct: 20,
  serviceLevelPct: 95,
  reviewPeriodDays: 7,
};

Deno.test("safety stock is finite and uses both variability sources", () => {
  const result = new SafetyStockFormula().calculate(baseInput);
  assert(Number.isFinite(result.safetyStock), "safetyStock must be finite");
  assert(Number.isFinite(result.reorderPoint), "reorderPoint must be finite");
  assert(result.safetyStock > 0);
  assert(result.reorderPoint > result.leadTimeDemand);
  assert(result.coverageDemand === 140, "coverage must be velocity × (lead time + review period)");
});

Deno.test("higher demand variability increases safety stock", () => {
  const formula = new SafetyStockFormula();
  const low = formula.calculate({ ...baseInput, demandCoefficientOfVariation: 0.1 });
  const high = formula.calculate({ ...baseInput, demandCoefficientOfVariation: 0.8 });
  assert(high.safetyStock > low.safetyStock);
});

Deno.test("invalid inputs fail loudly instead of returning NaN", () => {
  const formula = new SafetyStockFormula();
  assertThrows(() => formula.calculate({ ...baseInput, leadTimeDays: 0 }));
  assertThrows(() => formula.calculate({ ...baseInput, demandCoefficientOfVariation: -1 }));
  assertThrows(() => formula.calculate({ ...baseInput, leadTimeVariabilityPct: Number.NaN }));
});

function fakeSupabase(tables: Record<string, { single?: any; rows?: any[] }>) {
  const build = (table: string) => {
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      lte: () => builder,
      gte: () => builder,
      limit: () => builder,
      maybeSingle: () => Promise.resolve({ data: tables[table]?.single ?? null, error: null }),
      then: (resolve: (v: any) => any, reject?: (e: any) => any) =>
        Promise.resolve({ data: tables[table]?.rows ?? [], error: null }).then(resolve, reject),
    };
    return builder;
  };
  return { from: (table: string) => build(table) };
}

Deno.test("missing context signals are neutral and reported, never invented", async () => {
  const multipliers = new ContextMultipliers(fakeSupabase({
    weather_cache: {},
    stores: { single: { country_code: 'NL', region_code: null } },
    holiday_calendar: {},
    promotional_calendar: { rows: [] },
  }));

  const result = await multipliers.calculate({
    tenantId: 't', storeId: 's', materialId: 'm',
    forecastDate: new Date(), baseVelocity: 10,
  });

  assertEquals(result.dataQuality.weather, 'UNAVAILABLE');
  assertEquals(result.dataQuality.holiday, 'UNAVAILABLE');
  assertEquals(result.dataQuality.promotion, 'NONE');
  assertEquals(result.compositeMultiplier, 1);
});

Deno.test("stale promotions are not applied; composite is capped", async () => {
  const staleMultipliers = new ContextMultipliers(fakeSupabase({
    weather_cache: { single: { temp_avg_c: 26, weather_condition: 'Clear', retail_impact_score: null, fetched_at: new Date().toISOString() } },
    stores: { single: { country_code: 'NL' } },
    holiday_calendar: { single: { sales_uplift_factor: 2, is_store_closed: false, holiday_name: 'Peak' } },
    promotional_calendar: { rows: [{ uplift_factor: 2, promotion_name: 'Stale', synced_from_erp_at: null }] },
  }));
  const stale = await staleMultipliers.calculate({
    tenantId: 't', storeId: 's', materialId: 'm', forecastDate: new Date(), baseVelocity: 10,
  });
  assertEquals(stale.dataQuality.promotion, 'STALE');
  assertEquals(stale.compositeMultiplier, 2.6, "1.3 weather × 2 holiday, promo ignored");

  const verifiedMultipliers = new ContextMultipliers(fakeSupabase({
    weather_cache: { single: { temp_avg_c: 26, weather_condition: 'Clear', retail_impact_score: null, fetched_at: new Date().toISOString() } },
    stores: { single: { country_code: 'NL' } },
    holiday_calendar: { single: { sales_uplift_factor: 2, is_store_closed: false, holiday_name: 'Peak' } },
    promotional_calendar: { rows: [{ uplift_factor: 2, promotion_name: 'Verified', synced_from_erp_at: new Date().toISOString() }] },
  }));
  const verified = await verifiedMultipliers.calculate({
    tenantId: 't', storeId: 's', materialId: 'm', forecastDate: new Date(), baseVelocity: 10,
  });
  assertEquals(verified.compositeMultiplier, 3, "compounding must be capped at 3.0");
});
