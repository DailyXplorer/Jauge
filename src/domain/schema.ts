import type { FuelId } from "./fuels";

/**
 * Shapes of the static files written to `public/data` by the pipeline and read by the app.
 * Prices are integers in thousandths of a euro per litre (1789 = 1.789 €/L) to keep files small.
 */

export type IsoDate = string;

/** A daily series per fuel, starting at `start` and one value per consecutive calendar day. */
export interface DailySeries {
  start: IsoDate;
  values: Partial<Record<FuelId, (number | null)[]>>;
}

export interface RegionRef {
  code: string;
  name: string;
}

export interface DepartmentRef {
  code: string;
  name: string;
  region: string;
}

export interface CityRef {
  /** INSEE commune code. */
  code: string;
  name: string;
  department: string;
  stations: number;
  /** True when the city has enough stations for a published daily average. */
  hasHistory: boolean;
}

export interface Meta {
  generatedAt: string;
  firstDate: IsoDate;
  lastDate: IsoDate;
  stationCount: number;
  snapshotAt: string;
  regions: RegionRef[];
  departments: DepartmentRef[];
  cities: CityRef[];
}

/** `series/dept-<code>.json`: the department average plus its cities with history. */
export interface DepartmentSeriesFile {
  department: DailySeries;
  cities: Record<string, DailySeries>;
}

export interface StationPrice {
  fuel: FuelId;
  price: number;
  updatedAt: string;
}

export interface Station {
  id: string;
  address: string;
  city: string;
  cityCode: string | null;
  postcode: string;
  department: string;
  lat: number | null;
  lon: number | null;
  prices: StationPrice[];
  /** Fuels temporarily out of stock right now. */
  outOfStock: FuelId[];
}

/** `stations/<regionCode>.json`. */
export interface StationsFile {
  snapshotAt: string;
  stations: Station[];
}

/** `ranking.json`: latest average per region, fuel → region code → price. */
export interface RankingFile {
  date: IsoDate;
  values: Partial<Record<FuelId, Record<string, number>>>;
}

/** `brent.json`: Brent crude, forward-filled to calendar days. */
export interface BrentFile {
  start: IsoDate;
  /** €/bbl with 2 decimals. */
  eur: (number | null)[];
  /** $/bbl with 2 decimals. */
  usd: (number | null)[];
  lastObservation: IsoDate;
}

export type TrendDirection = "up" | "stable" | "down";

export interface FuelTrend {
  fuel: FuelId;
  direction: TrendDirection;
  /** Probability of `direction` under the model's error distribution (0–1). */
  probability: number;
  /** Expected 7-day change of the national average, cents per litre. */
  expectedChangeCents: number;
  /** Half-width of the uncertainty band (one residual standard deviation), cents per litre. */
  bandCents: number;
  /** Days between the Brent move and the pump response that fit history best. */
  lagDays: number;
  /** Length of the Brent change window, in days. */
  windowDays: number;
  /** Brent € change over the window that drives the forecast, percent. */
  brentChangePct: number;
  /** Last day of the Brent window used for the forecast. */
  brentWindowEnd: IsoDate;
  /** National average change over the previous 7 days, cents per litre. */
  lastWeekChangeCents: number;
  /** Cents per litre of pump change per 1% of Brent € change. */
  brentSlope: number;
  /** Share of last week's pump change expected to carry on. */
  momentumSlope: number;
  intercept: number;
  r2: number;
  sampleSize: number;
  backtest: {
    hitRate: number;
    baselineHitRate: number;
    samples: number;
    from: IsoDate;
    to: IsoDate;
  };
}

export interface TrendFile {
  asOf: IsoDate;
  horizonDays: number;
  stableThresholdCents: number;
  fuels: FuelTrend[];
}
