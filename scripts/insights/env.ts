import { readFile, stat } from "node:fs/promises";
import { parseEnv } from "node:util";

export const ENV_KEYS = ["MISTRAL_API_KEY", "MISTRAL_MODEL", "MISTRAL_MIN_REQUEST_INTERVAL_MS"] as const;

export type JobEnv = Partial<Record<(typeof ENV_KEYS)[number], string>>;

export type EnvResult = { ok: true; env: JobEnv } | { ok: false; error: string };

/**
 * Reads the job's three settings from `.env`, and nothing else from it. The file must be readable by its
 * owner only (mode 600). Without a `.env`, the same three are read from the process environment.
 */
export async function readJobEnv(file: string, processEnv: NodeJS.ProcessEnv = process.env): Promise<EnvResult> {
  let mode: number;
  try {
    mode = (await stat(file)).mode;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return { ok: true, env: pick(processEnv) };
  }
  if (mode & 0o077) {
    const octal = (mode & 0o777).toString(8);
    return {
      ok: false,
      error: `${file} is readable by other users (mode ${octal}). Fix it with: chmod 600 ${JSON.stringify(file)}`,
    };
  }
  return { ok: true, env: pick(parseEnv(await readFile(file, "utf8"))) };
}

function pick(source: Record<string, string | undefined>): JobEnv {
  const env: JobEnv = {};
  for (const key of ENV_KEYS) if (source[key]) env[key] = source[key];
  return env;
}
