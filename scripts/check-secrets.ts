/**
 * Fails when the Mistral key could leak: its value, or an assignment with a value, in `dist/`,
 * `public/` or any file tracked by git; or any reference to it from the browser code in `src/`.
 *
 *   pnpm check:secrets      (also runs after `pnpm build`)
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface ScannedFile {
  path: string;
  content: Buffer;
}

const KEY_NAME = "MISTRAL_API_KEY";
/** The key name followed by `=` or `:` and a value; an empty assignment (as in `.env.example`) passes. */
const ASSIGNMENT = new RegExp(`${KEY_NAME}["']?\\s*[=:]\\s*["']?[^\\s"'#,;}]+`);
const BROWSER_REFERENCE = new RegExp(`${KEY_NAME}|VITE_MISTRAL`);

/** One message per leak found; empty when clean. */
export function findLeaks(files: readonly ScannedFile[], key: string | undefined): string[] {
  const leaks: string[] = [];
  const keyBytes = key && key.length >= 8 ? Buffer.from(key) : null;
  for (const file of files) {
    if (keyBytes && file.content.includes(keyBytes)) leaks.push(`${file.path}: contains the key value`);
    const text = file.content.toString("latin1");
    if (ASSIGNMENT.test(text)) leaks.push(`${file.path}: assigns ${KEY_NAME} a value`);
    if (file.path.startsWith("src/") && BROWSER_REFERENCE.test(text)) leaks.push(`${file.path}: browser code references the key`);
  }
  return leaks;
}

function listFiles(root: string, dir: string): string[] {
  const full = path.join(root, dir);
  if (!existsSync(full)) return [];
  return readdirSync(full, { recursive: true, encoding: "utf8" })
    .map((entry) => path.join(dir, entry))
    .filter((file) => statSync(path.join(root, file)).isFile());
}

function main(): number {
  const root = path.resolve(import.meta.dirname, "..");
  if (existsSync(path.join(root, ".env"))) process.loadEnvFile(path.join(root, ".env"));
  const tracked = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean);
  const paths = new Set([...listFiles(root, "dist"), ...listFiles(root, "public"), ...tracked]);
  const files = [...paths]
    .filter((file) => existsSync(path.join(root, file)))
    .map((file) => ({ path: file.split(path.sep).join("/"), content: readFileSync(path.join(root, file)) }));

  const leaks = findLeaks(files, process.env[KEY_NAME]);
  if (leaks.length) {
    console.error(`Secret check failed:\n${leaks.map((l) => `  ${l}`).join("\n")}`);
    return 1;
  }
  console.log(`Secret check passed: ${files.length} files scanned, key ${process.env[KEY_NAME] ? "value" : "name"} not found.`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main();
