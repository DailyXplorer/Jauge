import { FUELS, type FuelId } from "@/domain/fuels";
import type { DailySeries } from "@/domain/schema";

const DAY_MS = 86_400_000;

export function dateAt(start: string, index: number): string {
  return new Date(Date.parse(`${start}T00:00:00Z`) + index * DAY_MS).toISOString().slice(0, 10);
}

export function seriesLength(series: DailySeries): number {
  return Math.max(0, ...Object.values(series.values).map((v) => v?.length ?? 0));
}

/** Index and value of the last non-null point at or before `before`. */
export function lastPoint(values: readonly (number | null)[] | undefined, before = Infinity) {
  if (!values) return null;
  for (let i = Math.min(values.length - 1, before); i >= 0; i--) {
    const value = values[i];
    if (value != null) return { index: i, value };
  }
  return null;
}

export interface FuelSummary {
  fuel: FuelId;
  /** Thousandths of €/L. */
  current: number;
  date: string;
  change7: number | null;
  change30: number | null;
  /** Last 90 days, € per litre, for sparklines. */
  spark: { date: string; value: number | null }[];
}

/** Today's value and its change in cents vs 7 and 30 days earlier. */
export function summarise(series: DailySeries, fuel: FuelId): FuelSummary | null {
  const values = series.values[fuel];
  const last = lastPoint(values);
  if (!values || !last) return null;
  const at = (daysAgo: number) => {
    const value = values[last.index - daysAgo];
    return value == null ? null : (last.value - value) / 10;
  };
  const from = Math.max(0, last.index - 89);
  return {
    fuel,
    current: last.value,
    date: dateAt(series.start, last.index),
    change7: at(7),
    change30: at(30),
    spark: values.slice(from, last.index + 1).map((v, i) => ({
      date: dateAt(series.start, from + i),
      value: v == null ? null : v / 1000,
    })),
  };
}

export const RANGES = ["1M", "3M", "6M", "1Y", "2Y", "All"] as const;
export type Range = (typeof RANGES)[number];
const RANGE_DAYS: Record<Range, number> = { "1M": 31, "3M": 92, "6M": 183, "1Y": 366, "2Y": 731, All: Infinity };

export type ChartRow = { date: string; [series: string]: string | number | null };

/**
 * Turns named daily series into chart rows over the last `range`, in € per litre. Series may start
 * on different days; rows are aligned on calendar dates.
 */
export function toRows(named: Record<string, { start: string; values: readonly (number | null)[] | undefined }>, range: Range): ChartRow[] {
  let end = "";
  for (const { start, values } of Object.values(named)) {
    const last = lastPoint(values);
    if (last) {
      const date = dateAt(start, last.index);
      if (date > end) end = date;
    }
  }
  if (!end) return [];
  const endMs = Date.parse(`${end}T00:00:00Z`);
  let startMs = Infinity;
  for (const { start } of Object.values(named)) startMs = Math.min(startMs, Date.parse(`${start}T00:00:00Z`));
  if (Number.isFinite(RANGE_DAYS[range])) startMs = Math.max(startMs, endMs - (RANGE_DAYS[range] - 1) * DAY_MS);

  const rows: ChartRow[] = [];
  for (let ms = startMs; ms <= endMs; ms += DAY_MS) {
    const date = new Date(ms).toISOString().slice(0, 10);
    const row: ChartRow = { date };
    for (const [key, { start, values }] of Object.entries(named)) {
      const index = Math.round((ms - Date.parse(`${start}T00:00:00Z`)) / DAY_MS);
      const value = values?.[index];
      row[key] = value == null ? null : value / 1000;
    }
    rows.push(row);
  }
  return rows;
}

export function fuelsIn(series: DailySeries): FuelId[] {
  return FUELS.filter((fuel) => lastPoint(series.values[fuel]) !== null);
}
