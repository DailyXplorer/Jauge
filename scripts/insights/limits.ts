import { open, readFile, rm, stat } from "node:fs/promises";
import { writeFileAtomic } from "./atomic";

/**
 * Cost and abuse limits for the market brief job. The state lives in `data-cache/`, so the limits hold
 * across runs and across a manual run racing the LaunchAgent.
 */

export const LIMITS = {
  /** launchd fires every 30 min; 2 min of slack absorbs the varying duration of `data:refresh` before us. */
  minRunGapMs: 28 * 60_000,
  callsPerRun: 3,
  callsPerDay: 60,
  requestTimeoutMs: 60_000,
  /** A lock older than this belongs to a crashed job; the job (data refresh, then brief) runs every 30 min. */
  staleLockMs: 25 * 60_000,
} as const;

export interface LimitState {
  lastRunAt: string | null;
  /** UTC day `callsToday` counts for. */
  day: string;
  callsToday: number;
  lastCallAt: string | null;
  lastWebSearchAt: string | null;
  /** Mistral's `x-ratelimit-remaining-web-search-day` (20 per day on this account) and the UTC day it was read. */
  webSearchRemaining: number | null;
  webSearchDay: string;
}

export const EMPTY_STATE: LimitState = {
  lastRunAt: null,
  day: "",
  callsToday: 0,
  lastCallAt: null,
  lastWebSearchAt: null,
  webSearchRemaining: null,
  webSearchDay: "",
};

export const WEB_SEARCH = { minGapMs: 2 * 3_600_000, minRemaining: 3 } as const;

/**
 * The feeds path is the default. `web_search` is used at most once every 2 hours, and only while more
 * than 2 searches remain today; on a new UTC day the quota is assumed reset until a response says otherwise.
 */
export function shouldUseWebSearch(state: LimitState, now: Date): boolean {
  const sinceLast = state.lastWebSearchAt ? now.getTime() - Date.parse(state.lastWebSearchAt) : Infinity;
  if (sinceLast < WEB_SEARCH.minGapMs) return false;
  const today = now.toISOString().slice(0, 10);
  return state.webSearchDay !== today || (state.webSearchRemaining ?? 0) >= WEB_SEARCH.minRemaining;
}

export type RunDecision = { ok: true; state: LimitState } | { ok: false; reason: string };

/** Starts a run if the previous one is old enough; the returned state records the start. */
export function startRun(state: LimitState, now: Date): RunDecision {
  if (state.lastRunAt) {
    const elapsed = now.getTime() - Date.parse(state.lastRunAt);
    if (elapsed >= 0 && elapsed < LIMITS.minRunGapMs) {
      return { ok: false, reason: `last run ${Math.round(elapsed / 60_000)} min ago` };
    }
  }
  return { ok: true, state: { ...state, lastRunAt: now.toISOString() } };
}

export type CallDecision = { ok: true; state: LimitState; waitMs: number } | { ok: false; reason: string };

/** Reserves one API call, or refuses it when the run or day budget is spent. */
export function reserveCall(
  state: LimitState,
  callsThisRun: number,
  now: Date,
  minRequestIntervalMs: number,
): CallDecision {
  if (callsThisRun >= LIMITS.callsPerRun) return { ok: false, reason: `run cap of ${LIMITS.callsPerRun} calls reached` };
  const day = now.toISOString().slice(0, 10);
  const callsToday = state.day === day ? state.callsToday : 0;
  if (callsToday >= LIMITS.callsPerDay) return { ok: false, reason: `daily cap of ${LIMITS.callsPerDay} calls reached` };
  const sinceLast = state.lastCallAt ? now.getTime() - Date.parse(state.lastCallAt) : Infinity;
  const waitMs = Math.max(0, Math.min(minRequestIntervalMs, minRequestIntervalMs - sinceLast));
  const callAt = new Date(now.getTime() + waitMs).toISOString();
  return { ok: true, waitMs, state: { ...state, day, callsToday: callsToday + 1, lastCallAt: callAt } };
}

export async function readState(path: string): Promise<LimitState> {
  try {
    return { ...EMPTY_STATE, ...(JSON.parse(await readFile(path, "utf8")) as Partial<LimitState>) };
  } catch {
    return EMPTY_STATE;
  }
}

export async function writeState(path: string, state: LimitState): Promise<void> {
  await writeFileAtomic(path, `${JSON.stringify(state, null, 2)}\n`);
}

/**
 * Takes an exclusive lock file. Returns a release function, or null when another live run holds it.
 * A lock left by a crashed run is removed once it is older than `staleLockMs`.
 */
export async function acquireLock(path: string, now = new Date()): Promise<(() => Promise<void>) | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await open(path, "wx");
      await handle.writeFile(JSON.stringify({ pid: process.pid, at: now.toISOString() }));
      await handle.close();
      return () => rm(path, { force: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const age = now.getTime() - (await stat(path)).mtimeMs;
      if (age < LIMITS.staleLockMs) return null;
      await rm(path, { force: true });
    }
  }
  return null;
}
