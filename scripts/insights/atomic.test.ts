import { chmod, mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { writeFileAtomic } from "./atomic";

async function directory(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "jauge-atomic-"));
}

describe("writeFileAtomic", () => {
  it("replaces the file and leaves no temporary file", async () => {
    const dir = await directory();
    const file = path.join(dir, "insights.json");
    await writeFile(file, '{"old":true}\n');
    await writeFileAtomic(file, '{"new":true}\n');
    expect(await readFile(file, "utf8")).toBe('{"new":true}\n');
    expect(await readdir(dir)).toEqual(["insights.json"]);
  });

  it("keeps the previous file when the write fails", async () => {
    const dir = await directory();
    const file = path.join(dir, "insights.json");
    await writeFile(file, '{"old":true}\n');
    await chmod(dir, 0o555);
    try {
      await expect(writeFileAtomic(file, '{"new":true}\n')).rejects.toThrow(/EACCES/);
    } finally {
      await chmod(dir, 0o755);
    }
    expect(await readFile(file, "utf8")).toBe('{"old":true}\n');
    expect(await readdir(dir)).toEqual(["insights.json"]);
  });

  it("removes the temporary file when the rename fails", async () => {
    const dir = await directory();
    const target = path.join(dir, "insights.json");
    await mkdir(path.join(target, "occupied"), { recursive: true });
    await expect(writeFileAtomic(target, "{}")).rejects.toThrow();
    expect(await readdir(dir)).toEqual(["insights.json"]);
    expect(await readdir(target)).toEqual(["occupied"]);
  });
});
