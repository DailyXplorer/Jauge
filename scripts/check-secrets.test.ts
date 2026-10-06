import { describe, expect, it } from "vitest";
import { findLeaks } from "./check-secrets";

// Built at runtime so this tracked file never contains a literal assignment itself.
const NAME = ["MISTRAL", "API", "KEY"].join("_");
const KEY = "test-not-a-real-key-123456";
const file = (path: string, content: string) => ({ path, content: Buffer.from(content) });

describe("findLeaks", () => {
  it("passes clean files and an empty assignment in .env.example", () => {
    expect(findLeaks([file(".env.example", `${NAME}=\n`), file("dist/index.js", "console.log(1)")], KEY)).toEqual([]);
  });

  it("finds the key value in the build output", () => {
    expect(findLeaks([file("dist/assets/index.js", `const k="${KEY}"`)], KEY)).toEqual([
      "dist/assets/index.js: contains the key value",
    ]);
  });

  it("finds an assignment with a value even when the key is unknown", () => {
    expect(findLeaks([file("README.md", `export ${NAME}=abc123`)], undefined)).toEqual([
      "README.md: assigns MISTRAL_API_KEY a value",
    ]);
  });

  it("finds a JSON-style assignment in public data", () => {
    expect(findLeaks([file("public/data/insights.json", `{"${NAME}": "abc123"}`)], undefined)).toEqual([
      "public/data/insights.json: assigns MISTRAL_API_KEY a value",
    ]);
  });

  it("refuses any reference to the key from browser code", () => {
    expect(findLeaks([file("src/lib/ai.ts", `import.meta.env.VITE_${NAME}`)], undefined)).toEqual([
      "src/lib/ai.ts: browser code references the key",
    ]);
  });
});
