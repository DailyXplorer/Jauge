import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ENV_KEYS, readJobEnv } from "./env";

const [KEY, MODEL, INTERVAL] = ENV_KEYS;

async function envFile(mode: number): Promise<string> {
  const file = path.join(await mkdtemp(path.join(tmpdir(), "jauge-env-")), ".env");
  await writeFile(file, `${KEY}=test-value\n${MODEL}=mistral-small-latest\nOTHER_SECRET=nope\nNODE_OPTIONS=--inspect\n`);
  await chmod(file, mode);
  return file;
}

describe("readJobEnv", () => {
  it("reads only the three job settings from a 600 file", async () => {
    expect(await readJobEnv(await envFile(0o600), {})).toEqual({
      ok: true,
      env: { [KEY]: "test-value", [MODEL]: "mistral-small-latest" },
    });
  });

  it.each([0o644, 0o640, 0o604, 0o660])("refuses a file with mode %o and says how to fix it", async (mode) => {
    const file = await envFile(mode);
    expect(await readJobEnv(file, {})).toEqual({
      ok: false,
      error: `${file} is readable by other users (mode ${mode.toString(8)}). Fix it with: chmod 600 "${file}"`,
    });
  });

  it("falls back to the same three settings from the environment when there is no .env", async () => {
    const missing = path.join(await mkdtemp(path.join(tmpdir(), "jauge-env-")), ".env");
    expect(await readJobEnv(missing, { [INTERVAL]: "2000", OTHER_SECRET: "nope" })).toEqual({
      ok: true,
      env: { [INTERVAL]: "2000" },
    });
  });
});
