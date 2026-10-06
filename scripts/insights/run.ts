/**
 * Writes `public/data/insights.json`: an AI market brief explaining why French pump prices may move.
 *
 *   pnpm insights:run
 *
 * Runs server-side only, every 30 minutes from the LaunchAgent (see scripts/install-launchd.sh). The
 * site never talks to the model: it only reads the validated file this script publishes.
 */
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import type { InsightsFile, MarketBrief, TrendFile } from "../../src/domain/schema";
import { validateBrief, type ModelBrief } from "./brief";
import { loadFacts } from "./facts";
import { fetchFeedItems, type FeedItem } from "./feeds";
import { acquireLock, LIMITS, readState, reserveCall, shouldUseWebSearch, startRun, writeState } from "./limits";
import { createClient, errorStatus, requestBriefFromFeeds, requestBriefWithWebSearch } from "./mistral";

type Path = "web" | "feeds";

const ROOT = path.resolve(import.meta.dirname, "../..");
const CACHE = path.join(ROOT, "data-cache");
const DATA = path.join(ROOT, "public/data");
const OUTPUT = path.join(DATA, "insights.json");
const LOG = path.join(CACHE, "insights.log");

async function main(): Promise<number> {
  if (existsSync(path.join(ROOT, ".env"))) process.loadEnvFile(path.join(ROOT, ".env"));
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    console.error("MISTRAL_API_KEY is not set (see .env.example).");
    return 1;
  }
  const model = process.env.MISTRAL_MODEL || "mistral-medium-latest";
  const minRequestIntervalMs = Number(process.env.MISTRAL_MIN_REQUEST_INTERVAL_MS) || 1100;
  const log = (entry: Record<string, unknown>) =>
    appendFile(LOG, `${JSON.stringify({ time: new Date().toISOString(), model, ...entry })}\n`);

  await mkdir(CACHE, { recursive: true });
  const release = await acquireLock(path.join(CACHE, "insights.lock"));
  if (!release) {
    console.log("Another insights run is in progress; exiting.");
    await log({ event: "skipped", reason: "locked" });
    return 0;
  }

  try {
    const statePath = path.join(CACHE, "insights-state.json");
    const run = startRun(await readState(statePath), new Date());
    if (!run.ok) {
      console.log(`Skipped: ${run.reason} (one run per 30 min).`);
      await log({ event: "skipped", reason: run.reason });
      return 0;
    }
    let state = run.state;
    await writeState(statePath, state);

    const { facts, trend } = await loadFacts(DATA);
    const client = createClient(apiKey, LIMITS.requestTimeoutMs);
    const today = new Date().toISOString().slice(0, 10);
    let errors: string[] = [];
    let feedItems: FeedItem[] | null = null;
    const paths: Path[] = shouldUseWebSearch(state, new Date()) ? ["web", "feeds", "feeds"] : ["feeds", "feeds"];

    for (const [index, via] of paths.entries()) {
      const attempt = index + 1;
      const call = reserveCall(state, index, new Date(), minRequestIntervalMs);
      if (!call.ok) {
        await log({ event: "call", attempt, via, ok: false, error: call.reason });
        break;
      }
      state = call.state;
      await writeState(statePath, state);
      await sleep(call.waitMs);

      const startedAt = Date.now();
      try {
        let response;
        if (via === "web") {
          state = { ...state, lastWebSearchAt: new Date().toISOString() };
          try {
            response = await requestBriefWithWebSearch(client, model, facts, today, errors);
          } finally {
            state = { ...state, webSearchRemaining: client.webSearchRemainingDay() ?? state.webSearchRemaining, webSearchDay: today };
            await writeState(statePath, state);
          }
        } else {
          feedItems ??= await fetchFeedItems();
          if (feedItems.length === 0) throw new Error("no feed items");
          response = await requestBriefFromFeeds(client, model, facts, today, feedItems, errors);
        }
        const result = validateBrief(response.text, response.searchUrls);
        await log({
          event: "call",
          attempt,
          via,
          ok: result.ok,
          durationMs: Date.now() - startedAt,
          ...response.usage,
          ...(result.ok ? { droppedSources: result.dropped.length } : { error: `validation: ${result.errors.length} issues` }),
        });
        if (result.ok) {
          await publish({ generatedAt: new Date().toISOString(), model, brief: withPriceModel(result.brief, trend) });
          console.log(`Published (${via === "web" ? "web_search" : "RSS feeds"}): ${result.brief.headline.en}`);
          if (result.dropped.length) console.log(`Dropped ${result.dropped.length} source(s): ${result.dropped.join("; ")}`);
          return 0;
        }
        errors = result.errors;
        console.error(`Attempt ${attempt} rejected: ${errors.slice(0, 5).join("; ")}`);
      } catch (error) {
        const status = errorStatus(error);
        const kind = status ? `http ${status}` : error instanceof Error && error.name.includes("Timeout") ? "timeout" : "error";
        await log({ event: "call", attempt, via, ok: false, durationMs: Date.now() - startedAt, error: kind });
        console.error(`Attempt ${attempt} (${via}) failed: ${kind}`);
        // A web_search quota error falls back to the feeds; any other auth or rate error ends the run.
        if (via === "web" && status === 429) state = { ...state, webSearchRemaining: 0, webSearchDay: today };
        else if (status === 429 || status === 401 || status === 403) break;
      }
    }

    await markStale();
    return 1;
  } finally {
    await release();
  }
}

/** The AI view never replaces the numeric trend; a confident disagreement is flagged so the UI shows both. */
function withPriceModel(brief: ModelBrief, trend: TrendFile): MarketBrief {
  return {
    ...brief,
    fuels: brief.fuels.map((fuel) => {
      const priceModelDirection = trend.fuels.find((t) => t.fuel === fuel.fuel)?.direction ?? null;
      return {
        ...fuel,
        priceModelDirection,
        conflictsWithPriceModel:
          priceModelDirection !== null && fuel.confidence === "high" && fuel.direction !== priceModelDirection,
      };
    }),
  };
}

async function publish(fields: Omit<InsightsFile, "checkedAt" | "stale">): Promise<void> {
  await writeInsights({ ...fields, checkedAt: fields.generatedAt, stale: false });
}

/** Keeps the previous brief, marked stale. Without one, nothing is published. */
async function markStale(): Promise<void> {
  let previous: InsightsFile;
  try {
    previous = JSON.parse(await readFile(OUTPUT, "utf8")) as InsightsFile;
  } catch {
    console.error("No valid brief; nothing published.");
    return;
  }
  await writeInsights({ ...previous, checkedAt: new Date().toISOString(), stale: true });
  console.error("No valid brief; the previous one is kept and marked stale.");
}

async function writeInsights(file: InsightsFile): Promise<void> {
  const temporary = `${OUTPUT}.tmp`;
  await writeFile(temporary, `${JSON.stringify(file)}\n`);
  await rename(temporary, OUTPUT);
}

process.exitCode = await main();
