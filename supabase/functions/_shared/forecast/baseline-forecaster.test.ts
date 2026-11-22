// Tests for the deterministic baseline forecaster.
// Run: npx -y deno test --no-lock --node-modules-dir=auto supabase/functions/_shared/forecast/baseline-forecaster.test.ts

import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  aggregateWindow, BASELINE_MODEL_VERSION, forecastDemand,
  DemandObservation,
} from "./baseline-forecaster.ts";

function syntheticHistory(days: number): DemandObservation[] {
  const rows: DemandObservation[] = [];
  const start = Date.UTC(2026, 6, 1);
  for (let i = 0; i < days; i++) {
    const date = new Date(start + i * 86400000);
    const weekday = date.getUTCDay();
    const weekendLift = weekday === 0 || weekday === 6 ? 1.4 : 1;
    const trend = 1 + i / days * 0.2;
    rows.push({
      date: date.toISOString().split('T')[0],
      qty: Math.round(10 * weekendLift * trend),
    });
  }
  return rows;
}

Deno.test("baseline produces finite P50/P90 with an out-of-sample backtest", () => {
  const result = forecastDemand({ history: syntheticHistory(56), horizonDays: 7 });
  assertEquals(result.modelVersion, BASELINE_MODEL_VERSION);
  assertEquals(result.points.length, 7);
  assert(result.backtest !== null, "backtest should be available with 56 days of history");
  assert(Number.isFinite(result.backtest!.wape));
  assert(Number.isFinite(result.backtest!.naiveWape));
  for (const point of result.points) {
    assert(Number.isFinite(point.p50) && point.p50 >= 0);
    assert(point.p90 >= point.p50, "P90 must never be below P50");
    assert(Number.isFinite(point.contextFactor));
  }
});

Deno.test("stockout days are censored, not treated as zero demand", () => {
  const history = syntheticHistory(56);
  history[30] = { ...history[30], qty: 0, stockout: true };
  const result = forecastDemand({ history, horizonDays: 3 });
  assertEquals(result.diagnostics.stockoutDays, 1);
  assertEquals(result.diagnostics.usableDays, 55);
});

Deno.test("context features scale demand and aggregate over a window", () => {
  const history = syntheticHistory(56);
  const last = history[history.length - 1].date;
  const next = new Date(new Date(`${last}T00:00:00Z`).getTime() + 86400000).toISOString().split('T')[0];
  const result = forecastDemand({
    history,
    horizonDays: 5,
    features: [{ date: next, weather: 1.2, holiday: 1, promotion: 1.5 }],
  });
  assert(result.points[0].contextFactor > 1.7, "1.2 × 1.5 context should be applied and capped at 3");
  const window = aggregateWindow(result.points, 3);
  assert(window.p50 > 0 && window.p90 >= window.p50);
  assertEquals(result.points.length, 5);
});

Deno.test("sparse history is handled without fabricating confidence", () => {
  const result = forecastDemand({ history: syntheticHistory(10), horizonDays: 3 });
  assertEquals(result.backtest, null);
  assert(result.diagnostics.uncertaintyMultiplier >= 1);
  assertEquals(result.points.length, 3);
});
