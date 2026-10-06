import { readFile } from "node:fs/promises";
import { cached } from "./download";
import { addDays, dayIndex } from "./dates";

const BRENT_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DCOILBRENTEU";
const EURUSD_URL = "https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?format=csvdata&startPeriod=2015-01-01";

export interface BrentSeries {
  /** €/bbl per calendar day from `start`, forward-filled over weekends and holidays. */
  eur: (number | null)[];
  usd: (number | null)[];
  lastObservation: string;
}

/** Brent in USD (FRED) converted to EUR with the ECB reference rate, aligned on calendar days. */
export async function loadBrent(start: string, end: string): Promise<BrentSeries> {
  const policy = { kind: "maxAge", maxAgeHours: 6 } as const;
  const [brentFile, fxFile] = await Promise.all([
    cached(BRENT_URL, "brent-usd.csv", policy),
    cached(EURUSD_URL, "eurusd.csv", policy),
  ]);
  if (!brentFile || !fxFile) throw new Error("Brent or EUR/USD series unavailable");

  const brent = parseCsv(await readFile(brentFile.path, "utf8"), "observation_date", "DCOILBRENTEU");
  const fx = parseCsv(await readFile(fxFile.path, "utf8"), "TIME_PERIOD", "OBS_VALUE");

  const days = dayIndex(end, start) + 1;
  const eur: (number | null)[] = new Array(days).fill(null);
  const usd: (number | null)[] = new Array(days).fill(null);
  let lastUsd: number | null = null;
  let lastRate: number | null = null;
  let lastObservation = "";
  // Seed with observations before `start` so the first days are filled.
  for (const [date, value] of brent) if (date < start) lastUsd = value;
  for (const [date, value] of fx) if (date < start) lastRate = value;

  for (let i = 0; i < days; i++) {
    const date = addDays(start, i);
    const usdToday = brent.get(date);
    const rateToday = fx.get(date);
    if (usdToday !== undefined) {
      lastUsd = usdToday;
      lastObservation = date;
    }
    if (rateToday !== undefined) lastRate = rateToday;
    if (lastUsd !== null && lastRate !== null) {
      usd[i] = round2(lastUsd);
      eur[i] = round2(lastUsd / lastRate);
    }
  }
  // Do not extrapolate past the last Brent observation.
  const lastIndex = lastObservation ? dayIndex(lastObservation, start) : -1;
  for (let i = lastIndex + 1; i < days; i++) {
    eur[i] = null;
    usd[i] = null;
  }
  return { eur, usd, lastObservation };
}

function parseCsv(text: string, dateColumn: string, valueColumn: string): Map<string, number> {
  const lines = text.trim().split(/\r?\n/);
  const header = splitCsvLine(lines[0]);
  const dateAt = header.indexOf(dateColumn);
  const valueAt = header.indexOf(valueColumn);
  if (dateAt < 0 || valueAt < 0) throw new Error(`Unexpected CSV header: ${lines[0].slice(0, 120)}`);
  const out = new Map<string, number>();
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const value = Number(cells[valueAt]);
    if (cells[valueAt] && Number.isFinite(value) && value > 0) out.set(cells[dateAt], value);
  }
  return out;
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (const char of line) {
    if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else cell += char;
  }
  cells.push(cell);
  return cells;
}

const round2 = (value: number) => Math.round(value * 100) / 100;
