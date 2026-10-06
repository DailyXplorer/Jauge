import { use } from "react";
import type {
  BrentFile,
  DailySeries,
  DepartmentSeriesFile,
  Meta,
  RankingFile,
  StationsFile,
  TrendFile,
} from "@/domain/schema";

const cache = new Map<string, Promise<unknown>>();

/** Fetches a file from `public/data` once; the promise is shared so `use()` can suspend on it. */
function load<T>(file: string): Promise<T> {
  let promise = cache.get(file);
  if (!promise) {
    promise = fetch(`/data/${file}`).then((response) => {
      if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
      return response.json();
    });
    cache.set(file, promise);
  }
  return promise as Promise<T>;
}

export const useMeta = () => use(load<Meta>("meta.json"));
export const useNational = () => use(load<DailySeries>("series/fr.json"));
export const useTrend = () => use(load<TrendFile>("trend.json"));
export const useBrent = () => use(load<BrentFile>("brent.json"));
export const useRanking = () => use(load<RankingFile>("ranking.json"));
export const useRegionSeries = (code: string) => use(load<DailySeries>(`series/region-${code}.json`));
export const useDepartmentSeries = (code: string) => use(load<DepartmentSeriesFile>(`series/dept-${code}.json`));
export const useStations = (region: string) => use(load<StationsFile>(`stations/${region}.json`));
