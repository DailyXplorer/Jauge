import { readFile } from "node:fs/promises";
import path from "node:path";
import { FUELS, type FuelId } from "../../src/domain/fuels";
import type { BrentFile, DailySeries, TrendFile } from "../../src/domain/schema";
import { addDays } from "../data/dates";

/** Jauge's own numbers: the only project data the model sees besides the fixed prompt. */
export interface MarketFacts {
  pricesAsOf: string;
  fuels: {
    fuel: FuelId;
    averageEurPerLitre: number;
    change7dCents: number | null;
    change30dCents: number | null;
    priceModel: { direction: string; expectedChangeCents: number; probability: number; horizonDays: number } | null;
  }[];
  brent: {
    asOf: string;
    eurPerBarrel: number | null;
    usdPerBarrel: number | null;
    change7dPct: number | null;
    change30dPct: number | null;
  };
  eurUsd: number | null;
}

export async function loadFacts(dataDir: string): Promise<{ facts: MarketFacts; trend: TrendFile }> {
  const read = async <T>(file: string) => JSON.parse(await readFile(path.join(dataDir, file), "utf8")) as T;
  const [national, brent, trend] = await Promise.all([
    read<DailySeries>("series/fr.json"),
    read<BrentFile>("brent.json"),
    read<TrendFile>("trend.json"),
  ]);

  const fuels = FUELS.flatMap((fuel) => {
    const values = national.values[fuel];
    const last = lastIndex(values);
    if (!values || last < 0) return [];
    const change = (days: number) => {
      const before = values[last - days];
      return before == null ? null : round((values[last]! - before) / 10, 1);
    };
    const model = trend.fuels.find((t) => t.fuel === fuel);
    return [
      {
        fuel,
        averageEurPerLitre: values[last]! / 1000,
        change7dCents: change(7),
        change30dCents: change(30),
        priceModel: model
          ? {
              direction: model.direction,
              expectedChangeCents: model.expectedChangeCents,
              probability: model.probability,
              horizonDays: trend.horizonDays,
            }
          : null,
      },
    ];
  });

  const at = lastIndex(brent.eur);
  const pct = (series: (number | null)[], days: number) => {
    const now = series[at];
    const before = series[at - days];
    return now == null || before == null ? null : round((now / before - 1) * 100, 1);
  };
  const eur = brent.eur[at] ?? null;
  const usd = brent.usd[at] ?? null;

  return {
    trend,
    facts: {
      pricesAsOf: addDays(national.start, lastIndex(national.values.gazole)),
      fuels,
      brent: {
        asOf: brent.lastObservation,
        eurPerBarrel: eur,
        usdPerBarrel: usd,
        change7dPct: pct(brent.eur, 7),
        change30dPct: pct(brent.eur, 30),
      },
      eurUsd: eur && usd ? round(usd / eur, 4) : null,
    },
  };
}

function lastIndex(values: readonly (number | null)[] | undefined): number {
  if (!values) return -1;
  for (let i = values.length - 1; i >= 0; i--) if (values[i] != null) return i;
  return -1;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
