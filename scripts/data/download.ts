import { existsSync, statSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export const CACHE_DIR = path.resolve("data-cache");

export type CachePolicy =
  /** Download only if the file is not cached yet. */
  | { kind: "once" }
  /** Re-download when the cached copy is older than `maxAgeHours`. */
  | { kind: "maxAge"; maxAgeHours: number };

export interface CachedFile {
  path: string;
  downloaded: boolean;
}

/**
 * Downloads `url` into `data-cache/<name>` following `policy`. Returns null on HTTP 404 so callers
 * can skip days that are not published yet. Writes atomically so an interrupted run never leaves a
 * truncated archive in the cache.
 */
export async function cached(url: string, name: string, policy: CachePolicy): Promise<CachedFile | null> {
  const target = path.join(CACHE_DIR, name);
  if (existsSync(target) && isFresh(target, policy)) return { path: target, downloaded: false };

  await mkdir(CACHE_DIR, { recursive: true });
  const response = await fetchWithRetry(url);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GET ${url} failed with HTTP ${response.status}`);
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length === 0) return null;
  const tmp = `${target}.part`;
  await writeFile(tmp, body);
  await rename(tmp, target);
  return { path: target, downloaded: true };
}

function isFresh(file: string, policy: CachePolicy): boolean {
  if (policy.kind === "once") return true;
  const ageHours = (Date.now() - statSync(file).mtimeMs) / 3_600_000;
  return ageHours < policy.maxAgeHours;
}

async function fetchWithRetry(url: string, attempts = 3): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "jauge-data-pipeline" },
        signal: AbortSignal.timeout(300_000),
      });
      if (response.status < 500) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000 * attempt));
  }
  throw new Error(`GET ${url} failed after ${attempts} attempts: ${String(lastError)}`);
}
