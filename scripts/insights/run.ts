/**
 * Writes `public/data/insights.json`: an AI brief, in French, on what could move French pump prices today.
 * Started by `scripts/job.ts` (`pnpm insights:run`, or `pnpm job` after the data refresh), which holds
 * the job lock. Runs server-side only; the site never talks to the model, it only reads the validated
 * file this publishes.
 */
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import type { InsightsFile, MarketBrief, TrendFile } from "../../src/domain/schema";
import { writeFileAtomic } from "./atomic";
import { validateBrief, type ModelBrief } from "./brief";
import { readJobEnv } from "./env";
import { loadFacts } from "./facts";
import { FEED_HOSTS, fetchFeedItems, type FeedItem } from "./feeds";
import { LIMITS, readState, reserveCall, shouldUseWebSearch, startRun, writeState } from "./limits";
import { createLogger, type Logger } from "./log";
import { createClient, errorStatus, requestBriefFromFeeds, requestBriefWithWebSearch } from "./mistral";
import { createSafeFetch } from "./net";

type Path = "web" | "feeds";

const ROOT = path.resolve(import.meta.dirname, "../..");
const CACHE = path.join(ROOT, "data-cache");
const OUTPUT = path.join(ROOT, "public/data/insights.json");

const MISTRAL_HOST = "api.mistral.ai";

export async function runInsights(): Promise<number> {
  const config = await readJobEnv(path.join(ROOT, ".env"));
  if (!config.ok) {
    console.error(`Refusing to run: ${config.error}`);
    return 1;
  }
  const apiKey = config.env.MISTRAL_API_KEY;
  if (!apiKey) {
    console.error("MISTRAL_API_KEY is not set (see .env.example).");
    return 1;
  }
  const model = config.env.MISTRAL_MODEL || "mistral-medium-latest";
  const minRequestIntervalMs = Number(config.env.MISTRAL_MIN_REQUEST_INTERVAL_MS) || 1100;
  await mkdir(CACHE, { recursive: true });
  const log = createLogger(path.join(CACHE, "insights.log"), [apiKey], { model });

  const statePath = path.join(CACHE, "insights-state.json");
  const run = startRun(await readState(statePath), new Date());
  if (!run.ok) {
    log.info(`Skipped: ${run.reason} (one run per 30 min).`);
    await log.record({ event: "skipped", reason: run.reason });
    return 0;
  }
  let state = run.state;
  await writeState(statePath, state);

  const { facts, trend } = await loadFacts(path.dirname(OUTPUT));
  // Measured calls take 13–55 s, so the API keeps the 60 s timeout; feeds get the default 10 s.
  const client = createClient(
    apiKey,
    LIMITS.requestTimeoutMs,
    createSafeFetch({ hosts: [MISTRAL_HOST], timeoutMs: LIMITS.requestTimeoutMs }),
  );
  const feedFetch = createSafeFetch({ hosts: FEED_HOSTS });
  const today = new Date().toISOString().slice(0, 10);
  let errors: string[] = [];
  let feedItems: FeedItem[] | null = null;
  const paths: Path[] = shouldUseWebSearch(state, new Date()) ? ["web", "feeds", "feeds"] : ["feeds", "feeds"];

  for (const [index, via] of paths.entries()) {
    const attempt = index + 1;
    const call = reserveCall(state, index, new Date(), minRequestIntervalMs);
    if (!call.ok) {
      await log.record({ event: "call", attempt, via, ok: false, error: call.reason });
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
          response = await requestBriefWithWebSearch(client, model, facts, new Date(), errors);
        } finally {
          state = { ...state, webSearchRemaining: client.webSearchRemainingDay() ?? state.webSearchRemaining, webSearchDay: today };
          await writeState(statePath, state);
        }
      } else {
        feedItems ??= await fetchFeedItems(feedFetch);
        if (feedItems.length === 0) throw new Error("no feed items from the last 72 h");
        response = await requestBriefFromFeeds(client, model, facts, new Date(), feedItems, errors);
      }
      const result = validateBrief(response.text, response.searchUrls);
      await log.record({
        event: "call",
        attempt,
        via,
        ok: result.ok,
        durationMs: Date.now() - startedAt,
        ...response.usage,
        ...(feedItems && via === "feeds" ? { feedItems: feedItems.length } : {}),
        ...(result.ok ? { droppedSources: result.dropped.length } : { error: `validation: ${result.errors.length} issues` }),
      });
      if (result.ok) {
        await publish({ generatedAt: new Date().toISOString(), model, brief: enrich(result.brief, trend) });
        log.info(`Published (${via === "web" ? "web_search" : "RSS feeds"}): ${result.brief.headline}`);
        if (result.dropped.length) log.info(`Dropped ${result.dropped.length} source(s): ${result.dropped.join("; ")}`);
        return 0;
      }
      errors = result.errors;
      log.error(`Attempt ${attempt} rejected: ${errors.slice(0, 5).join("; ")}`);
    } catch (error) {
      const status = errorStatus(error);
      const kind = errorKind(error, status);
      await log.record({ event: "call", attempt, via, ok: false, durationMs: Date.now() - startedAt, error: kind });
      log.error(`Attempt ${attempt} (${via}) failed: ${kind}`);
      // A web_search quota error falls back to the feeds; any other auth or rate error ends the run.
      if (via === "web" && status === 429) state = { ...state, webSearchRemaining: 0, webSearchDay: today };
      else if (status === 429 || status === 401 || status === 403) break;
    }
  }

  await markStale(log);
  return 1;
}

/**
 * API errors carry the response body, which may echo headers, so only their status is kept. Other
 * errors are ours (blocked fetch, timeout, no feed items) and keep a short message.
 */
function errorKind(error: unknown, status: number | null): string {
  if (status) return `http ${status}`;
  if (!(error instanceof Error)) return "error";
  if (error.name.includes("Timeout")) return "timeout";
  return `${error.name}: ${error.message}`.slice(0, 200);
}

/**
 * Adds what the job knows better than the model. The AI view never replaces the numeric trend: a
 * confident disagreement is flagged so the UI shows both. Each driver is dated by its newest source.
 */
function enrich(brief: ModelBrief, trend: TrendFile): MarketBrief {
  const published = new Map(brief.sources.map((s) => [s.id, s.publishedAt]));
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
    drivers: brief.drivers.map((driver) => {
      const dates = driver.sourceIds.flatMap((id) => published.get(id) ?? []);
      const newest = dates.sort((a, b) => Date.parse(b) - Date.parse(a))[0];
      return newest ? { ...driver, publishedAt: newest } : driver;
    }),
  };
}

async function publish(fields: Omit<InsightsFile, "checkedAt" | "stale">): Promise<void> {
  await writeInsights({ ...fields, checkedAt: fields.generatedAt, stale: false });
}

/** Keeps the previous brief, marked stale. Without one, nothing is published. */
async function markStale(log: Logger): Promise<void> {
  let previous: InsightsFile;
  try {
    previous = JSON.parse(await readFile(OUTPUT, "utf8")) as InsightsFile;
  } catch {
    log.error("No valid brief; nothing published.");
    return;
  }
  await writeInsights({ ...previous, checkedAt: new Date().toISOString(), stale: true });
  log.error("No valid brief; the previous one is kept and marked stale.");
}

function writeInsights(file: InsightsFile): Promise<void> {
  return writeFileAtomic(OUTPUT, `${JSON.stringify(file)}\n`);
}
