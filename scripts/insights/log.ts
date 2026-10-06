import { appendFile } from "node:fs/promises";

const REDACTED = "[redacted]";

/** Mistral keys are 32 alphanumerics; any run that long is treated as a key. */
const KEY_SHAPED = /(?<![A-Za-z0-9])[A-Za-z0-9]{32,}(?![A-Za-z0-9])/g;
const BEARER = /\bbearer\s+[^\s"',;]+/gi;
const KEY_FIELD = /\b(authorization|x-api-key|api[_-]?key)(["']?\s*[:=]\s*["']?)[^\s"',;}]+/gi;

/** Removes the given secrets and anything shaped like a key or an auth header from a log line. */
export function redact(text: string, secrets: readonly string[] = []): string {
  let result = text;
  for (const secret of secrets) if (secret.length >= 8) result = result.split(secret).join(REDACTED);
  return result
    .replace(BEARER, `Bearer ${REDACTED}`)
    .replace(KEY_FIELD, `$1$2${REDACTED}`)
    .replace(KEY_SHAPED, REDACTED);
}

export interface Logger {
  info: (message: string) => void;
  error: (message: string) => void;
  /** One JSON line of metadata in the log file. */
  record: (entry: Record<string, unknown>) => Promise<void>;
}

/** Every line, on the console or in the file, goes through `redact`. */
export function createLogger(file: string, secrets: readonly string[], context: Record<string, unknown> = {}): Logger {
  return {
    info: (message) => console.log(redact(message, secrets)),
    error: (message) => console.error(redact(message, secrets)),
    record: (entry) =>
      appendFile(file, `${redact(JSON.stringify({ time: new Date().toISOString(), ...context, ...entry }), secrets)}\n`),
  };
}
