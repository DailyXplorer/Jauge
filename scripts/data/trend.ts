import type { FuelId } from "../../src/domain/fuels";
import type { FuelTrend, TrendDirection } from "../../src/domain/schema";
import { addDays } from "./dates";

export const HORIZON_DAYS = 7;
export const STABLE_THRESHOLD_CENTS = 0.5;
const LAGS = [7, 10, 14, 21];
const WINDOWS = [7, 14];
const MIN_TRAINING_SAMPLES = 120;
const BACKTEST_DAYS = 365;

type Series = readonly (number | null)[];

interface Candidate {
  lag: number;
  window: number;
}

interface Fit extends Candidate {
  intercept: number;
  brentSlope: number;
  momentumSlope: number;
  r2: number;
  residualSd: number;
  n: number;
}

/**
 * Brent € change (percent) over `window` days, ending `lag - HORIZON_DAYS` days before `t`, so that
 * the pump change from `t` to `t + HORIZON_DAYS` is compared with the Brent move `lag` days earlier.
 * The anchor is clamped to the last Brent observation, which lags a few days behind pump data.
 */
function brentChange(brent: Series, t: number, c: Candidate, lastBrent: number): number | null {
  const end = Math.min(t + HORIZON_DAYS - c.lag, lastBrent);
  const start = end - c.window;
  const a = brent[start];
  const b = brent[end];
  return a == null || b == null || start < 0 ? null : ((b - a) / a) * 100;
}

/** Pump change in cents per litre from `t` to `t + HORIZON_DAYS`; prices are in thousandths. */
function pumpChange(pump: Series, t: number): number | null {
  const a = pump[t];
  const b = pump[t + HORIZON_DAYS];
  return a == null || b == null ? null : (b - a) / 10;
}

interface Features {
  brent: number;
  momentum: number;
}

function features(pump: Series, brent: Series, t: number, c: Candidate, lastBrent: number): Features | null {
  const b = brentChange(brent, t, c, lastBrent);
  const m = pumpChange(pump, t - HORIZON_DAYS);
  return b === null || m === null ? null : { brent: b, momentum: m };
}

/** Ordinary least squares of y on (brent, momentum) with an intercept, solved in closed form. */
function fitCandidate(pump: Series, brent: Series, c: Candidate, lastTarget: number, lastBrent: number): Fit | null {
  const rows: [number, number, number][] = [];
  for (let t = HORIZON_DAYS; t <= lastTarget; t++) {
    // Training samples must only use Brent data observed before the pump outcome.
    if (t + HORIZON_DAYS - c.lag > lastBrent) break;
    const x = features(pump, brent, t, c, lastBrent);
    const y = pumpChange(pump, t);
    if (x && y !== null) rows.push([x.brent, x.momentum, y]);
  }
  const n = rows.length;
  if (n < MIN_TRAINING_SAMPLES) return null;
  const mean = [0, 1, 2].map((k) => rows.reduce((s, r) => s + r[k], 0) / n);
  let s11 = 0, s12 = 0, s22 = 0, s1y = 0, s2y = 0, syy = 0;
  for (const r of rows) {
    const a = r[0] - mean[0];
    const b = r[1] - mean[1];
    const y = r[2] - mean[2];
    s11 += a * a;
    s12 += a * b;
    s22 += b * b;
    s1y += a * y;
    s2y += b * y;
    syy += y * y;
  }
  if (s11 === 0 || syy === 0) return null;
  let brentSlope: number;
  let momentumSlope: number;
  const det = s11 * s22 - s12 * s12;
  if (s22 === 0 || Math.abs(det) < 1e-9) {
    brentSlope = s1y / s11;
    momentumSlope = 0;
  } else {
    brentSlope = (s22 * s1y - s12 * s2y) / det;
    momentumSlope = (s11 * s2y - s12 * s1y) / det;
  }
  const intercept = mean[2] - brentSlope * mean[0] - momentumSlope * mean[1];
  const explained = brentSlope * s1y + momentumSlope * s2y;
  const r2 = explained / syy;
  const residualSd = Math.sqrt(Math.max(0, (syy - explained) / Math.max(1, n - 3)));
  return { ...c, intercept, brentSlope, momentumSlope, r2, residualSd, n };
}

function bestFit(pump: Series, brent: Series, lastTarget: number, lastBrent: number): Fit | null {
  let best: Fit | null = null;
  for (const lag of LAGS) {
    for (const window of WINDOWS) {
      const fit = fitCandidate(pump, brent, { lag, window }, lastTarget, lastBrent);
      if (fit && (!best || fit.r2 > best.r2)) best = fit;
    }
  }
  return best;
}

const predict = (fit: Fit, x: Features) => fit.intercept + fit.brentSlope * x.brent + fit.momentumSlope * x.momentum;

/** Direction of an observed change. */
export function classify(changeCents: number): TrendDirection {
  if (changeCents > STABLE_THRESHOLD_CENTS) return "up";
  if (changeCents < -STABLE_THRESHOLD_CENTS) return "down";
  return "stable";
}

/**
 * Most likely direction of a forecast, assuming normal errors around it. Classifying the point
 * forecast directly would favour "stable", because regression shrinks predictions towards zero.
 */
function mostLikely(expectedCents: number, sdCents: number): { direction: TrendDirection; probability: number } {
  const sd = Math.max(sdCents, 0.05);
  const pDown = normalCdf((-STABLE_THRESHOLD_CENTS - expectedCents) / sd);
  const pUp = 1 - normalCdf((STABLE_THRESHOLD_CENTS - expectedCents) / sd);
  const pStable = 1 - pDown - pUp;
  if (pStable >= pUp && pStable >= pDown) return { direction: "stable", probability: pStable };
  return pUp > pDown ? { direction: "up", probability: pUp } : { direction: "down", probability: pDown };
}

/** Abramowitz–Stegun approximation of the standard normal CDF. */
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

/**
 * Walk-forward backtest: for each day of the last year, refit using only outcomes known that day,
 * predict the direction of the next 7 days and compare with what happened. The baseline repeats the
 * direction of the previous 7 days.
 */
function backtest(pump: Series, brent: Series, lastDay: number, lastBrent: number, start: string) {
  let hits = 0;
  let baselineHits = 0;
  let samples = 0;
  let from = -1;
  let to = -1;
  for (let t = lastDay - HORIZON_DAYS - BACKTEST_DAYS; t <= lastDay - HORIZON_DAYS; t++) {
    const actual = pumpChange(pump, t);
    const previous = t >= HORIZON_DAYS ? pumpChange(pump, t - HORIZON_DAYS) : null;
    if (actual === null || previous === null) continue;
    const brentAvailable = Math.min(lastBrent, t);
    const fit = bestFit(pump, brent, t - HORIZON_DAYS, brentAvailable);
    if (!fit) continue;
    const x = features(pump, brent, t, fit, brentAvailable);
    if (!x) continue;
    const truth = classify(actual);
    hits += mostLikely(predict(fit, x), fit.residualSd).direction === truth ? 1 : 0;
    baselineHits += classify(previous) === truth ? 1 : 0;
    samples++;
    if (from < 0) from = t;
    to = t;
  }
  return {
    hitRate: samples ? round(hits / samples, 3) : 0,
    baselineHitRate: samples ? round(baselineHits / samples, 3) : 0,
    samples,
    from: from >= 0 ? addDays(start, from) : start,
    to: to >= 0 ? addDays(start, to) : start,
  };
}

/** Trend for one fuel at the last day of `pump`. Returns null when history is too short. */
export function computeTrend(fuel: FuelId, pump: Series, brent: Series, start: string): FuelTrend | null {
  let lastDay = pump.length - 1;
  while (lastDay >= 0 && pump[lastDay] == null) lastDay--;
  let lastBrent = brent.length - 1;
  while (lastBrent >= 0 && brent[lastBrent] == null) lastBrent--;
  if (lastDay < 0 || lastBrent < 0) return null;

  const fit = bestFit(pump, brent, lastDay - HORIZON_DAYS, lastBrent);
  if (!fit) return null;
  const x = features(pump, brent, lastDay, fit, lastBrent);
  if (!x) return null;
  const expected = predict(fit, x);
  const { direction, probability } = mostLikely(expected, fit.residualSd);
  return {
    fuel,
    direction,
    probability: round(probability, 2),
    expectedChangeCents: round(expected, 1),
    bandCents: round(fit.residualSd, 1),
    lagDays: fit.lag,
    windowDays: fit.window,
    brentChangePct: round(x.brent, 1),
    brentWindowEnd: addDays(start, Math.min(lastDay + HORIZON_DAYS - fit.lag, lastBrent)),
    lastWeekChangeCents: round(x.momentum, 1),
    brentSlope: round(fit.brentSlope, 4),
    momentumSlope: round(fit.momentumSlope, 4),
    intercept: round(fit.intercept, 4),
    r2: round(fit.r2, 3),
    sampleSize: fit.n,
    backtest: backtest(pump, brent, lastDay, lastBrent, start),
  };
}

const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;
