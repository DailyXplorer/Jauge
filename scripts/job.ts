/**
 * The scheduled job, under one lock so a manual run and the LaunchAgent never overlap:
 *
 *   pnpm job             data refresh, then the AI brief
 *   pnpm insights:run    the AI brief only
 *
 * Exits 0 when skipped (lock held, or the 30-minute guard), non-zero on a real failure.
 */
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { ENV_KEYS } from "./insights/env";
import { acquireLock } from "./insights/limits";
import { runInsights } from "./insights/run";

const ROOT = path.resolve(import.meta.dirname, "..");

async function main(): Promise<number> {
  await mkdir(path.join(ROOT, "data-cache"), { recursive: true });
  const release = await acquireLock(path.join(ROOT, "data-cache", "job.lock"));
  if (!release) {
    console.log("Another job is in progress; exiting.");
    return 0;
  }
  try {
    if (!process.argv.includes("--insights-only")) {
      const code = await refreshData();
      if (code !== 0) {
        console.error(`data:refresh failed with exit code ${code}; the brief is not run.`);
        return code;
      }
    }
    return await runInsights();
  } finally {
    await release();
  }
}

/** The data refresh runs as its own process, without any Mistral setting in its environment. */
function refreshData(): Promise<number> {
  const env = { ...process.env };
  for (const key of ENV_KEYS) delete env[key];
  return new Promise((resolve, reject) => {
    spawn("pnpm", ["data:refresh"], { cwd: ROOT, env, stdio: "inherit" })
      .on("error", reject)
      .on("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}

process.exitCode = await main();
