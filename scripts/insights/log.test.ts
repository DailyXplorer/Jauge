import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger, redact } from "./log";

const KEY = "Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4z";

describe("redact", () => {
  it("removes the key wherever it appears", () => {
    expect(redact(`401 for key ${KEY}.`, [KEY])).toBe("401 for key [redacted].");
    expect(redact(`short-secret-value in body`, ["short-secret-value"])).toBe("[redacted] in body");
  });

  it("removes anything shaped like a key, an auth header or a key field", () => {
    expect(redact(`unknown key ZZ3dEf6hIj9kLm2nOp5qRs8tUv1wXy4zQQ`)).toBe("unknown key [redacted]");
    expect(redact(`{"headers":{"Authorization":"Bearer sk-abc.def"}}`)).toBe(
      `{"headers":{"Authorization":"[redacted] [redacted]"}}`,
    );
    expect(redact("x-api-key: abc123; api_key=xyz")).toBe("x-api-key: [redacted]; api_key=[redacted]");
  });

  it("leaves ordinary log lines alone", () => {
    const line = "Attempt 1 rejected: headline: not French; sources.2: URL is not https";
    expect(redact(line, [KEY])).toBe(line);
  });
});

describe("createLogger", () => {
  afterEach(() => vi.restoreAllMocks());

  it("redacts console lines and log file entries", async () => {
    const file = path.join(await mkdtemp(path.join(tmpdir(), "jauge-log-")), "insights.log");
    const printed: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line: string) => printed.push(line));
    vi.spyOn(console, "error").mockImplementation((line: string) => printed.push(line));
    const log = createLogger(file, [KEY], { model: "m" });

    log.info(`Published with ${KEY}`);
    log.error(`failed: Bearer ${KEY}`);
    await log.record({ event: "call", error: `body echoed ${KEY}` });

    expect(printed).toEqual(["Published with [redacted]", "failed: Bearer [redacted]"]);
    const entry = JSON.parse(await readFile(file, "utf8"));
    expect([entry.model, entry.event, entry.error]).toEqual(["m", "call", "body echoed [redacted]"]);
  });
});
