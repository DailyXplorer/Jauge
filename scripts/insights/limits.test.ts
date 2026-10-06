import { mkdtemp, readFile, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { acquireLock, EMPTY_STATE, reserveCall, shouldUseWebSearch, startRun, type LimitState } from "./limits";

const at = (iso: string) => new Date(iso);

describe("startRun", () => {
  it("starts the first run and records it", () => {
    expect(startRun(EMPTY_STATE, at("2026-10-06T12:00:00Z"))).toEqual({
      ok: true,
      state: { ...EMPTY_STATE, lastRunAt: "2026-10-06T12:00:00.000Z" },
    });
  });

  it("refuses a run 10 minutes after the previous one", () => {
    const state = { ...EMPTY_STATE, lastRunAt: "2026-10-06T12:00:00.000Z" };
    expect(startRun(state, at("2026-10-06T12:10:00Z"))).toEqual({ ok: false, reason: "last run 10 min ago" });
  });

  it("accepts the next 30-minute slot even if it fires a little early", () => {
    const state = { ...EMPTY_STATE, lastRunAt: "2026-10-06T12:00:20.000Z" };
    expect(startRun(state, at("2026-10-06T12:30:05Z")).ok).toBe(true);
  });
});

describe("reserveCall", () => {
  const state: LimitState = { ...EMPTY_STATE, day: "2026-10-06", callsToday: 10, lastCallAt: "2026-10-06T12:00:00.000Z" };

  it("counts the call and waits out the minimum request interval", () => {
    expect(reserveCall(state, 0, at("2026-10-06T12:00:00.500Z"), 1100)).toEqual({
      ok: true,
      waitMs: 600,
      state: { ...state, callsToday: 11, lastCallAt: "2026-10-06T12:00:01.100Z" },
    });
  });

  it("stops at 3 calls per run", () => {
    expect(reserveCall(state, 3, at("2026-10-06T13:00:00Z"), 1100)).toEqual({
      ok: false,
      reason: "run cap of 3 calls reached",
    });
  });

  it("stops at 60 calls per day", () => {
    expect(reserveCall({ ...state, callsToday: 60 }, 0, at("2026-10-06T23:59:00Z"), 1100)).toEqual({
      ok: false,
      reason: "daily cap of 60 calls reached",
    });
  });

  it("resets the daily count on a new UTC day", () => {
    expect(reserveCall({ ...state, callsToday: 60 }, 0, at("2026-10-07T00:01:00Z"), 1100)).toEqual({
      ok: true,
      waitMs: 0,
      state: { ...state, day: "2026-10-07", callsToday: 1, lastCallAt: "2026-10-07T00:01:00.000Z" },
    });
  });
});

describe("shouldUseWebSearch", () => {
  const now = at("2026-10-06T14:00:00Z");

  it("uses web search when it was last used over 2 hours ago and 3 searches remain", () => {
    const state = { ...EMPTY_STATE, lastWebSearchAt: "2026-10-06T11:59:00.000Z", webSearchRemaining: 3, webSearchDay: "2026-10-06" };
    expect(shouldUseWebSearch(state, now)).toBe(true);
  });

  it("uses the feeds within 2 hours of the last web search", () => {
    const state = { ...EMPTY_STATE, lastWebSearchAt: "2026-10-06T12:30:00.000Z", webSearchRemaining: 15, webSearchDay: "2026-10-06" };
    expect(shouldUseWebSearch(state, now)).toBe(false);
  });

  it("uses the feeds when 2 or fewer searches remain today", () => {
    const state = { ...EMPTY_STATE, webSearchRemaining: 2, webSearchDay: "2026-10-06" };
    expect(shouldUseWebSearch(state, now)).toBe(false);
  });

  it("assumes the quota reset on a new UTC day", () => {
    const state = { ...EMPTY_STATE, webSearchRemaining: 0, webSearchDay: "2026-10-05" };
    expect(shouldUseWebSearch(state, now)).toBe(true);
  });
});

describe("acquireLock", () => {
  it("lets one run hold the lock and turns the concurrent one away", async () => {
    const lock = path.join(await mkdtemp(path.join(tmpdir(), "jauge-lock-")), "insights.lock");
    const release = await acquireLock(lock);
    expect(release).toBeTypeOf("function");
    expect(await acquireLock(lock)).toBeNull();
    await release!();
    const again = await acquireLock(lock);
    expect(again).toBeTypeOf("function");
    await again!();
  });

  it("takes over a lock left by a crashed run", async () => {
    const lock = path.join(await mkdtemp(path.join(tmpdir(), "jauge-lock-")), "insights.lock");
    await writeFile(lock, "{}");
    const old = new Date(Date.now() - 26 * 60_000);
    await utimes(lock, old, old);
    const release = await acquireLock(lock);
    expect(JSON.parse(await readFile(lock, "utf8")).pid).toBe(process.pid);
    await release!();
  });
});
