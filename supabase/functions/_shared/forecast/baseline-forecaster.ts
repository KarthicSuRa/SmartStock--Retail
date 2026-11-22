// /supabase/functions/_shared/forecast/baseline-forecaster.ts
//
// A deterministic, explainable demand baseline with uncertainty.
//
// This is deliberately NOT a trained ML model: Edge Functions cannot train one,
// and a transparent baseline is the right reference to beat before adding ML.
// It produces P50 (median) and P90 (upper-quantile) demand per store-material-day
// and measures out-of-sample error, so the planner can say "the model is wrong
// less often than the naive baseline" instead of just sounding confident.

export const BASELINE_MODEL_VERSION = 'baseline-seasonal-ewma-v1';

export interface DemandObservation {
  date: string; // YYYY-MM-DD
  qty: number;
  stockout?: boolean;
}

export interface ContextFeature {
  date: string; // YYYY-MM-DD
  /** Multipliers already validated by ContextMultipliers (1 = neutral). */
  weather: number;
  holiday: number;
  promotion: number;
}

export interface ForecastPoint {
  date: string;
  horizonDays: number;
  p50: number;
  p90: number;
  level: number;
  weekdayFactor: number;
  trendFactor: number;
  contextFactor: number;
}

export interface BacktestMetrics {
  wape: number;
  bias: number;
  p50Coverage: number;
  p90Coverage: number;
  naiveWape: number;
  sampleDays: number;
}

export interface ForecastResult {
  modelVersion: string;
  points: ForecastPoint[];
  backtest: BacktestMetrics | null;
  diagnostics: {
    historyDays: number;
    usableDays: number;
    stockoutDays: number;
    contextDaysAvailable: number;
    level: number;
    trendFactor: number;
    uncertaintyMultiplier: number;
  };
}

const DAY_MS = 86400000;
const WEEKDAY_WINDOW = 56;
const LEVEL_WINDOW = 28;
const HOLDOUT_DAYS = 14;
const ALPHA = 0.25;
const TREND_DAMPING = 0.5;

function iso(date: Date): string {
  return date.toISOString().split('T')[0];
}

function addDays(dateStr: string, days: number): string {
  return iso(new Date(new Date(`${dateStr}T00:00:00Z`).getTime() + days * DAY_MS));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const index = clamp(Math.floor(q * (sorted.length - 1)), 0, sorted.length - 1);
  return sorted[index];
}

interface Prepared {
  /** One value per calendar day, with stockout days marked but still dated. */
  days: Array<{ date: string; qty: number; stockout: boolean }>;
  usable: Array<{ date: string; qty: number }>;
}

function prepare(history: DemandObservation[]): Prepared {
  const byDate = new Map<string, DemandObservation>();
  for (const row of history) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) continue;
    byDate.set(row.date, {
      date: row.date,
      qty: Math.max(0, Number(row.qty) || 0),
      stockout: row.stockout === true,
    });
  }
  if (!byDate.size) return { days: [], usable: [] };

  const dates = Array.from(byDate.keys()).sort();
  const days: Prepared['days'] = [];
  for (let d = new Date(`${dates[0]}T00:00:00Z`).getTime();
    d <= new Date(`${dates[dates.length - 1]}T00:00:00Z`).getTime();
    d += DAY_MS) {
    const date = iso(new Date(d));
    const row = byDate.get(date);
    days.push({
      date,
      qty: row?.qty ?? 0,
      stockout: row?.stockout ?? false,
    });
  }

  return {
    days,
    // Stockout days are censored: zero sales there means "no observation",
    // not "no demand". Excluding them avoids under-forecasting.
    usable: days.filter((d) => !d.stockout).map((d) => ({ date: d.date, qty: d.qty })),
  };
}

function weekdayFactors(usable: Prepared['usable']): number[] {
  const window = usable.slice(-WEEKDAY_WINDOW);
  const totals = new Array(7).fill(0);
  const counts = new Array(7).fill(0);
  for (const row of window) {
    const wd = new Date(`${row.date}T00:00:00Z`).getUTCDay();
    totals[wd] += row.qty;
    counts[wd]++;
  }
  const overall = window.reduce((s, r) => s + r.qty, 0) / Math.max(1, window.length);
  if (overall <= 0) return new Array(7).fill(1);
  return totals.map((total, i) =>
    counts[i] ? clamp(total / counts[i] / overall, 0.4, 2.5) : 1,
  );
}

function deseasonalize(usable: Prepared['usable'], factors: number[]): number[] {
  return usable.map((row) => {
    const wd = new Date(`${row.date}T00:00:00Z`).getUTCDay();
    return row.qty / Math.max(0.01, factors[wd]);
  });
}

function ewma(values: number[]): number {
  if (!values.length) return 0;
  let level = values.slice(0, Math.min(7, values.length)).reduce((a, b) => a + b, 0) /
    Math.max(1, Math.min(7, values.length));
  for (const value of values) level = ALPHA * value + (1 - ALPHA) * level;
  return level;
}

function trendFactor(values: number[]): number {
  const split = Math.floor(values.length / 2);
  if (split < 5 || values.length - split < 5) return 1;
  const prior = values.slice(0, split).reduce((a, b) => a + b, 0) / split;
  const recent = values.slice(split).reduce((a, b) => a + b, 0) / (values.length - split);
  if (prior <= 0) return 1;
  return clamp(1 + ((recent - prior) / prior) * TREND_DAMPING, 0.7, 1.4);
}

function contextFor(featureMap: Map<string, ContextFeature>, date: string): number {
  const f = featureMap.get(date);
  if (!f) return 1;
  return clamp(f.weather * f.holiday * f.promotion, 0.5, 3);
}

interface CoreInput {
  prepared: Prepared;
  featureMap: Map<string, ContextFeature>;
  horizonDays: number;
  uncertaintyMultiplier: number;
}

function core(input: CoreInput): { points: ForecastPoint[]; level: number; trend: number } {
  const { prepared, featureMap, horizonDays } = input;
  const factors = weekdayFactors(prepared.usable);
  const deseasonalized = deseasonalize(prepared.usable, factors);
  const level = ewma(deseasonalized.slice(-LEVEL_WINDOW));
  const trend = trendFactor(deseasonalized.slice(-LEVEL_WINDOW));
  const lastDate = prepared.days[prepared.days.length - 1]?.date ?? iso(new Date());
  const points: ForecastPoint[] = [];

  for (let h = 1; h <= horizonDays; h++) {
    const date = addDays(lastDate, h);
    const wd = new Date(`${date}T00:00:00Z`).getUTCDay();
    const weekdayFactor = factors[wd];
    const contextFactor = contextFor(featureMap, date);
    const p50 = Math.max(0, level * weekdayFactor * contextFactor * trend);
    points.push({
      date,
      horizonDays: h,
      p50: Number(p50.toFixed(3)),
      p90: Number((p50 * input.uncertaintyMultiplier).toFixed(3)),
      level: Number(level.toFixed(3)),
      weekdayFactor: Number(weekdayFactor.toFixed(3)),
      trendFactor: Number(trend.toFixed(3)),
      contextFactor: Number(contextFactor.toFixed(3)),
    });
  }
  return { points, level, trend };
}

/** Residuals from an in-sample holdout, used to size the P90 buffer. */
function calibrationMultiplier(prepared: Prepared, featureMap: Map<string, ContextFeature>): {
  multiplier: number;
  backtest: BacktestMetrics | null;
} {
  const usable = prepared.usable;
  if (usable.length < HOLDOUT_DAYS + 14) return { multiplier: 1.3, backtest: null };

  const splitIndex = usable.length - HOLDOUT_DAYS;
  const train = { days: prepared.days, usable: usable.slice(0, splitIndex) };
  const actual = usable.slice(splitIndex);
  const predicted = core({
    prepared: train,
    featureMap,
    horizonDays: HOLDOUT_DAYS,
    uncertaintyMultiplier: 1, // P50 only during calibration
  }).points;

  const absErrors = predicted.map((p, i) => Math.abs((actual[i]?.qty ?? 0) - p.p50));
  const pctErrors = predicted.map((p, i) => {
    const a = actual[i]?.qty ?? 0;
    return a > 0 ? absErrors[i] / a : (absErrors[i] > 0 ? 1 : 0);
  }).sort((a, b) => a - b);

  const q90 = quantile(pctErrors, 0.9);
  const multiplier = clamp(1 + q90, 1.05, 3);

  const totalActual = actual.reduce((s, r) => s + r.qty, 0);
  const wape = totalActual > 0
    ? absErrors.reduce((s, e) => s + e, 0) / totalActual
    : (absErrors.reduce((s, e) => s + e, 0) > 0 ? 1 : 0);
  const bias = totalActual > 0
    ? (predicted.reduce((s, p) => s + p.p50, 0) - totalActual) / totalActual
    : 0;
  const p50Coverage = predicted.filter((p, i) => (actual[i]?.qty ?? 0) <= p.p50).length / HOLDOUT_DAYS;
  const p90Coverage = predicted.filter(
    (p, i) => (actual[i]?.qty ?? 0) <= p.p50 * multiplier,
  ).length / HOLDOUT_DAYS;

  // Naive reference: average of the training window, no seasonality/context.
  const naive = train.usable.reduce((s, r) => s + r.qty, 0) / Math.max(1, train.usable.length);
  const naiveError = actual.reduce((s, r) => s + Math.abs(r.qty - naive), 0);
  const naiveWape = totalActual > 0 ? naiveError / totalActual : (naiveError > 0 ? 1 : 0);

  return {
    multiplier,
    backtest: {
      wape: Number(wape.toFixed(4)),
      bias: Number(bias.toFixed(4)),
      p50Coverage: Number(p50Coverage.toFixed(4)),
      p90Coverage: Number(p90Coverage.toFixed(4)),
      naiveWape: Number(naiveWape.toFixed(4)),
      sampleDays: HOLDOUT_DAYS,
    },
  };
}

/**
 * Produces a demand forecast and its out-of-sample calibration. The caller
 * decides whether the backtest is good enough to trust for automation.
 */
export function forecastDemand(input: {
  history: DemandObservation[];
  features?: ContextFeature[];
  horizonDays: number;
  today?: string;
}): ForecastResult {
  const prepared = prepare(input.history);
  const featureMap = new Map((input.features ?? []).map((f) => [f.date, f]));
  const horizonDays = clamp(Math.floor(input.horizonDays), 1, 90);
  const { multiplier, backtest } = calibrationMultiplier(prepared, featureMap);
  const coreResult = core({ prepared, featureMap, horizonDays, uncertaintyMultiplier: multiplier });

  return {
    modelVersion: BASELINE_MODEL_VERSION,
    points: coreResult.points,
    backtest,
    diagnostics: {
      historyDays: prepared.days.length,
      usableDays: prepared.usable.length,
      stockoutDays: prepared.days.filter((d) => d.stockout).length,
      contextDaysAvailable: featureMap.size,
      level: Number(coreResult.level.toFixed(3)),
      trendFactor: Number(coreResult.trend.toFixed(3)),
      uncertaintyMultiplier: Number(multiplier.toFixed(3)),
    },
  };
}

/** Aggregates forecast points over a horizon into a single order-window band. */
export function aggregateWindow(points: ForecastPoint[], horizonDays: number): {
  p50: number;
  p90: number;
} {
  const window = points.filter((p) => p.horizonDays <= horizonDays);
  return {
    p50: Number(window.reduce((s, p) => s + p.p50, 0).toFixed(3)),
    p90: Number(window.reduce((s, p) => s + p.p90, 0).toFixed(3)),
  };
}
