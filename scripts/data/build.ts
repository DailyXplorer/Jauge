/**
 * Builds the static dataset in `public/data` from official open data.
 *
 *   pnpm data:build     downloads 2 full years + the current year + the last 30 days, then aggregates.
 *   pnpm data:refresh   reuses cached yearly archives and only fetches recent days, the instant feed
 *                       and market data, then aggregates again.
 */
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { FUELS, type FuelId } from "../../src/domain/fuels";
import type {
  BrentFile,
  CityRef,
  DailySeries,
  DepartmentSeriesFile,
  Meta,
  RankingFile,
  Station,
  StationsFile,
  TrendFile,
} from "../../src/domain/schema";
import { addDays, compactDate, dayIndex } from "./dates";
import { cached } from "./download";
import { loadGeography, type Place } from "./geo";
import { loadBrent } from "./market";
import { parseZippedFeed, type RawStation } from "./parse-prices";
import { computeTrend, HORIZON_DAYS, STABLE_THRESHOLD_CENTS } from "./trend";

const OPEN_DATA = "https://donnees.roulez-eco.fr/opendata";
const OUT_DIR = path.resolve("public/data");
const RECENT_DAYS = 30;
/** A station price older than this is no longer counted in daily averages. */
const STALE_DAYS = 21;
/** A snapshot price older than this is hidden from station lists. */
const SNAPSHOT_MAX_AGE_DAYS = 30;
const CITY_MIN_STATIONS = 3;
const CITY_MIN_DAILY_REPORTS = 2;
const MINUTES_PER_DAY = 1440;
/** Upper bound of normalised prices, thousandths of €/L (see `normalisePrice`). */
const MAX_PRICE = 4000;
const MAX_DEVIATION_FROM_MEDIAN = 0.3;

const refresh = process.argv.includes("--refresh");
const timings: [string, number][] = [];
let stepStart = Date.now();

function step(label: string) {
  const now = Date.now();
  timings.push([label, now - stepStart]);
  console.log(`✓ ${label} (${((now - stepStart) / 1000).toFixed(1)} s)`);
  stepStart = now;
}

interface StationInfo {
  postcode: string;
  address: string;
  city: string;
  lat: number | null;
  lon: number | null;
}

/** Price changes per station and fuel, flattened as [minute, price, minute, price, ...]. */
type EventLog = Map<string, Partial<Record<FuelId, number[]>>>;

async function main() {
  const startedAt = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  const currentYear = Number(today.slice(0, 4));
  const firstDate = `${currentYear - 2}-01-01`;
  const originMinute = Date.parse(`${firstDate}T00:00:00Z`) / 60_000;
  const toMinute = (timestamp: string) => Date.parse(`${timestamp}Z`) / 60_000 - originMinute;

  // 1. Downloads.
  const archives: string[] = [];
  for (let year = currentYear - 2; year <= currentYear; year++) {
    const policy =
      year === currentYear && !refresh ? ({ kind: "maxAge", maxAgeHours: 12 } as const) : ({ kind: "once" } as const);
    const file = await cached(`${OPEN_DATA}/annee/${year}`, `annee-${year}.zip`, policy);
    if (file) archives.push(file.path);
  }
  for (let offset = RECENT_DAYS; offset >= 1; offset--) {
    const day = compactDate(addDays(today, -offset));
    const file = await cached(`${OPEN_DATA}/jour/${day}`, `jour-${day}.zip`, { kind: "once" });
    if (file) archives.push(file.path);
  }
  const instant = await cached(`${OPEN_DATA}/instantane_ruptures`, "instantane_ruptures.zip", {
    kind: "maxAge",
    maxAgeHours: 0.15,
  });
  if (!instant) throw new Error("Instant feed unavailable");
  step(`downloads (${archives.length} archives + instant feed)`);

  const geo = await loadGeography();
  step("geography");

  // 2. Parse every feed into one event log; the instant feed also provides the station snapshot.
  const infos = new Map<string, StationInfo>();
  const events: EventLog = new Map();
  let lastMinute = 0;
  const record = (s: RawStation) => {
    infos.set(s.id, { postcode: s.postcode, address: s.address, city: s.city, lat: s.lat, lon: s.lon });
    let perFuel = events.get(s.id);
    if (!perFuel) events.set(s.id, (perFuel = {}));
    for (const p of s.prices) {
      const minute = toMinute(p.updatedAt);
      if (!Number.isFinite(minute) || minute < -STALE_DAYS * MINUTES_PER_DAY) continue;
      (perFuel[p.fuel] ??= []).push(minute, p.price);
      if (minute > lastMinute) lastMinute = minute;
    }
  };
  for (const archive of archives) await parseZippedFeed(archive, record);
  const snapshot: RawStation[] = [];
  await parseZippedFeed(instant.path, (s) => {
    record(s);
    snapshot.push(s);
  });
  step(`parsing (${events.size} stations seen)`);

  const todayIndex = dayIndex(today, firstDate);
  const lastDay = Math.min(Math.floor(lastMinute / MINUTES_PER_DAY), todayIndex);
  const days = lastDay + 1;
  const lastDate = addDays(firstDate, lastDay);

  // 3. Locate stations and pick cities with enough active stations.
  const places = new Map<string, Place>();
  for (const [id, info] of infos) {
    const place = geo.locate(info.postcode, info.city);
    if (place) places.set(id, place);
  }
  const snapshotMinute = lastMinute;
  const isActive = (s: RawStation) =>
    s.prices.some((p) => snapshotMinute - toMinute(p.updatedAt) <= SNAPSHOT_MAX_AGE_DAYS * MINUTES_PER_DAY);
  const activeSnapshot = snapshot.filter((s) => places.has(s.id) && isActive(s));
  const cityStations = new Map<string, { name: string; department: string; count: number }>();
  for (const s of activeSnapshot) {
    const commune = places.get(s.id)?.commune;
    if (!commune) continue;
    const entry = cityStations.get(commune.code) ?? { name: commune.name, department: commune.department, count: 0 };
    entry.count++;
    cityStations.set(commune.code, entry);
  }
  const historyCities = new Set([...cityStations].filter(([, c]) => c.count >= CITY_MIN_STATIONS).map(([code]) => code));

  // 4. Daily average per scope: each station contributes its last known price of the day.
  const accumulators = new Map<string, { sum: Float64Array; count: Uint32Array }>();
  const accumulator = (key: string) => {
    let acc = accumulators.get(key);
    if (!acc) {
      acc = { sum: new Float64Array(days * FUELS.length), count: new Uint32Array(days * FUELS.length) };
      accumulators.set(key, acc);
    }
    return acc;
  };
  // First pass: national median per day and fuel, from a histogram of prices in thousandths.
  const histogram = new Uint16Array(days * FUELS.length * (MAX_PRICE + 1));
  for (const [id, perFuel] of events) {
    if (!places.has(id)) continue;
    walkDailyPrices(perFuel, days, (slot, price) => histogram[slot * (MAX_PRICE + 1) + price]++);
  }
  const medians = new Uint16Array(days * FUELS.length);
  for (let slot = 0; slot < medians.length; slot++) {
    const bins = histogram.subarray(slot * (MAX_PRICE + 1), (slot + 1) * (MAX_PRICE + 1));
    const total = bins.reduce((s, c) => s + c, 0);
    let seen = 0;
    for (let price = 0; price <= MAX_PRICE && total > 0; price++) {
      seen += bins[price];
      if (seen * 2 >= total) {
        medians[slot] = price;
        break;
      }
    }
  }
  // A price far from the national median is a misreport, typically an SP98 price posted as E85 or GPLc.
  const plausible = (slot: number, price: number) =>
    Math.abs(price - medians[slot]) <= medians[slot] * MAX_DEVIATION_FROM_MEDIAN;

  // Second pass: averages per scope, ignoring misreports.
  for (const [id, perFuel] of events) {
    const place = places.get(id);
    if (!place) continue;
    const scopes = [accumulator("fr"), accumulator(`r:${place.region}`), accumulator(`d:${place.department}`)];
    if (place.commune && historyCities.has(place.commune.code)) scopes.push(accumulator(`c:${place.commune.code}`));
    walkDailyPrices(perFuel, days, (slot, price) => {
      if (!plausible(slot, price)) return;
      for (const scope of scopes) {
        scope.sum[slot] += price;
        scope.count[slot]++;
      }
    });
  }
  const seriesOf = (key: string, minReports = 1): DailySeries => {
    const acc = accumulators.get(key);
    const values: DailySeries["values"] = {};
    if (!acc) return { start: firstDate, values };
    FUELS.forEach((fuel, f) => {
      const column: (number | null)[] = [];
      for (let d = 0; d < days; d++) {
        const slot = d * FUELS.length + f;
        column.push(acc.count[slot] >= minReports ? Math.round(acc.sum[slot] / acc.count[slot]) : null);
      }
      if (column.some((v) => v !== null)) values[fuel] = column;
    });
    return { start: firstDate, values };
  };
  step(`daily averages (${accumulators.size} scopes × ${days} days)`);

  // 5. Market data and trend.
  const brent = await loadBrent(firstDate, lastDate);
  const national = seriesOf("fr");
  const trend: TrendFile = {
    asOf: lastDate,
    horizonDays: HORIZON_DAYS,
    stableThresholdCents: STABLE_THRESHOLD_CENTS,
    fuels: FUELS.flatMap((fuel) => {
      const pump = national.values[fuel];
      const result = pump ? computeTrend(fuel, pump, brent.eur, firstDate) : null;
      return result ? [result] : [];
    }),
  };
  step("brent and trend");

  // 6. Write outputs.
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(path.join(OUT_DIR, "series"), { recursive: true });
  await mkdir(path.join(OUT_DIR, "stations"), { recursive: true });
  const write = (file: string, data: unknown) => writeFile(path.join(OUT_DIR, file), JSON.stringify(data));

  await write("series/fr.json", national);
  for (const region of geo.regions) {
    if (accumulators.has(`r:${region.code}`)) await write(`series/region-${region.code}.json`, seriesOf(`r:${region.code}`));
  }
  for (const department of geo.departments) {
    if (!accumulators.has(`d:${department.code}`)) continue;
    const cities: Record<string, DailySeries> = {};
    for (const code of historyCities) {
      if (cityStations.get(code)?.department === department.code) cities[code] = seriesOf(`c:${code}`, CITY_MIN_DAILY_REPORTS);
    }
    const file: DepartmentSeriesFile = { department: seriesOf(`d:${department.code}`), cities };
    await write(`series/dept-${department.code}.json`, file);
  }

  const ranking: RankingFile = { date: lastDate, values: {} };
  for (const region of geo.regions) {
    const series = seriesOf(`r:${region.code}`);
    for (const fuel of FUELS) {
      const value = series.values[fuel]?.[lastDay];
      if (value != null) (ranking.values[fuel] ??= {})[region.code] = value;
    }
  }
  await write("ranking.json", ranking);

  const snapshotAt = new Date((snapshotMinute + originMinute) * 60_000).toISOString().slice(0, 19);
  const stationsByRegion = new Map<string, Station[]>();
  for (const s of activeSnapshot) {
    const place = places.get(s.id)!;
    const station: Station = {
      id: s.id,
      address: s.address,
      city: place.commune?.name ?? titleCase(s.city),
      cityCode: place.commune?.code ?? null,
      postcode: s.postcode,
      department: place.department,
      lat: s.lat,
      lon: s.lon,
      prices: s.prices
        .filter(
          (p) =>
            snapshotMinute - toMinute(p.updatedAt) <= SNAPSHOT_MAX_AGE_DAYS * MINUTES_PER_DAY &&
            plausible(lastDay * FUELS.length + FUELS.indexOf(p.fuel), p.price),
        )
        .map((p) => ({ fuel: p.fuel, price: p.price, updatedAt: p.updatedAt })),
      // Temporary stock-outs left open for weeks are abandoned records, not current shortages.
      outOfStock: [
        ...new Set(
          s.ruptures
            .filter(
              (r) =>
                r.temporary && !r.end && snapshotMinute - toMinute(r.start) <= SNAPSHOT_MAX_AGE_DAYS * MINUTES_PER_DAY,
            )
            .map((r) => r.fuel),
        ),
      ],
    };
    const list = stationsByRegion.get(place.region) ?? [];
    list.push(station);
    stationsByRegion.set(place.region, list);
  }
  // Every region with history gets a file, even when none of its stations is active right now.
  const regionsWithData = new Set([...accumulators.keys()].filter((k) => k.startsWith("r:")).map((k) => k.slice(2)));
  for (const region of new Set([...regionsWithData, ...stationsByRegion.keys()])) {
    const file: StationsFile = { snapshotAt, stations: stationsByRegion.get(region) ?? [] };
    await write(`stations/${region}.json`, file);
  }

  const brentFile: BrentFile = { start: firstDate, eur: brent.eur, usd: brent.usd, lastObservation: brent.lastObservation };
  await write("brent.json", brentFile);
  await write("trend.json", trend);

  const cities: CityRef[] = [...cityStations]
    .map(([code, c]) => ({
      code,
      name: c.name,
      department: c.department,
      stations: c.count,
      hasHistory: historyCities.has(code),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const usedDepartments = new Set([...accumulators.keys()].filter((k) => k.startsWith("d:")).map((k) => k.slice(2)));
  const meta: Meta = {
    generatedAt: new Date().toISOString(),
    firstDate,
    lastDate,
    stationCount: activeSnapshot.length,
    snapshotAt,
    regions: geo.regions.filter((r) => regionsWithData.has(r.code)),
    departments: geo.departments.filter((d) => usedDepartments.has(d.code)),
    cities,
  };
  await write("meta.json", meta);
  step("writing public/data");

  await report(meta, trend, startedAt);
}

async function report(meta: Meta, trend: TrendFile, startedAt: number) {
  let total = 0;
  let files = 0;
  const walk = async (dir: string) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else {
        total += (await stat(full)).size;
        files++;
      }
    }
  };
  await walk(OUT_DIR);
  console.log(`\nDates: ${meta.firstDate} → ${meta.lastDate} · snapshot ${meta.snapshotAt}`);
  console.log(`Active stations: ${meta.stationCount} · cities: ${meta.cities.length} (${meta.cities.filter((c) => c.hasHistory).length} with history)`);
  console.log(`Output: ${files} files, ${(total / 1e6).toFixed(1)} MB in public/data`);
  for (const t of trend.fuels) {
    console.log(
      `Trend ${t.fuel.padEnd(6)} ${t.direction.padEnd(6)} ${t.expectedChangeCents.toFixed(1).padStart(5)} ±${t.bandCents.toFixed(1)} c · lag ${t.lagDays} d / window ${t.windowDays} d · R² ${t.r2} · backtest ${(t.backtest.hitRate * 100).toFixed(0)}% (baseline ${(t.backtest.baselineHitRate * 100).toFixed(0)}%, n=${t.backtest.samples})`,
    );
  }
  console.log(`Total: ${((Date.now() - startedAt) / 1000).toFixed(1)} s`);
}

/**
 * Calls `visit(slot, price)` for each day a station has a usable price, where `slot` is
 * `day * FUELS.length + fuelIndex`. A day's price is the last one posted before midnight, if it is
 * less than STALE_DAYS old.
 */
function walkDailyPrices(
  perFuel: Partial<Record<FuelId, number[]>>,
  days: number,
  visit: (slot: number, price: number) => void,
) {
  FUELS.forEach((fuel, f) => {
    const log = perFuel[fuel];
    if (!log?.length) return;
    const order = Array.from({ length: log.length / 2 }, (_, i) => i).sort((a, b) => log[a * 2] - log[b * 2]);
    let cursor = 0;
    let price = 0;
    let priceMinute = -Infinity;
    for (let d = 0; d < days; d++) {
      const endOfDay = (d + 1) * MINUTES_PER_DAY;
      while (cursor < order.length && log[order[cursor] * 2] < endOfDay) {
        priceMinute = log[order[cursor] * 2];
        price = log[order[cursor] * 2 + 1];
        cursor++;
      }
      if (endOfDay - priceMinute <= STALE_DAYS * MINUTES_PER_DAY) visit(d * FUELS.length + f, price);
    }
  });
}

function titleCase(value: string): string {
  return value.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (m) => m.toUpperCase());
}

await main();
