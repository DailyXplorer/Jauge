import { z } from "zod";
import { FUELS } from "../../src/domain/fuels";

/**
 * The structure the model must return, and the checks that decide whether it may be published.
 * Everything the model writes comes from untrusted news pages, so every string is checked for markup,
 * links, prompt-injection phrasing and text that is not French before it can reach `public/`.
 */

const FORBIDDEN: { pattern: RegExp; reason: string }[] = [
  { pattern: /<\/?[a-z!?][^>]*>|&(?:[a-z]+|#\d+|#x[\da-f]+);/i, reason: "HTML" },
  { pattern: /\*\*|__|`|\[[^\]]*\]\([^)]*\)|^\s*(?:#{1,6}\s|[-*+]\s|>\s)/m, reason: "markdown" },
  { pattern: /\b(?:https?|ftp|javascript|data|vbscript|file):|\bwww\./i, reason: "link or script URL" },
  { pattern: /\bon[a-z]+\s*=|<script|\beval\s*\(/i, reason: "script" },
  {
    pattern:
      /\b(?:ignore|disregard|forget|override)\b.{0,40}\b(?:instruction|previous|prior|above|rules?)|\bignore[sz]?\b.{0,40}\b(?:consignes?|instructions?)\b|\boubliez?\b.{0,40}\b(?:consignes?|instructions?)\b/i,
    reason: "instruction to the model",
  },
  {
    pattern:
      /\b(?:system|developer)\s*(?:prompt|message|instructions?)\b|\bprompts?\b|\bjailbreak|\bas an ai\b|\ben tant qu'ia\b|\bsystème\s+(?:de\s+)?(?:prompt|consignes?)/i,
    reason: "mention of prompts or the system",
  },
  {
    pattern: /\bapi[\s_-]?keys?\b|\bsecret\s+keys?\b|\baccess\s+(?:keys?|tokens?)\b|\bclés?\s+(?:api|secrètes?|d'accès)\b|\bmots?\s+de\s+passe\b|\bpasswords?\b|MISTRAL_|\bbearer\b/i,
    reason: "mention of keys or secrets",
  },
  {
    pattern:
      /\b(?:click|tap)\b|\b(?:visit|subscribe|sign up|download|contact)\b(?:\s+\w+){0,2}\s+(?:here|now|our|us|below|the link)\b|\b(?:cliquez|abonnez-vous|inscrivez-vous|téléchargez|contactez-nous|rendez-vous sur)\b/i,
    reason: "instruction to the reader",
  },
];

/** Latin script, digits, punctuation, spaces and the symbols a fuel brief needs. */
const ALLOWED_CHARACTERS = /^[\p{Script=Latin}\p{N}\p{P}\p{Zs}€$£%°+±=<>~×−–—’‘“”«»]*$/u;

/**
 * Function words only, so names and tickers (Brent, WTI, OPEC+, Fed, EIA) count for neither side.
 * Words that are also French ("on", "as", "a", "in") are left out of the English list.
 */
const FRENCH_WORDS = new Set(
  "le la les l d des du de un une et en sur pour dans par au aux est sont qui que avec ce cette ces ses son sa leur plus pas ne se il elle ils".split(
    " ",
  ),
);
const ENGLISH_WORDS = new Set("the of and to for is are with by at from that this be has have its their will was were".split(" "));

/** Problems that make a string unpublishable; empty when it is safe. */
export function textProblems(value: string, french = false): string[] {
  const problems = FORBIDDEN.filter(({ pattern }) => pattern.test(value)).map(({ reason }) => reason);
  if (!ALLOWED_CHARACTERS.test(value)) problems.push("characters outside French/English text");
  if (french && !looksFrench(value)) problems.push("not French");
  return problems;
}

/** Short texts pass; longer ones need French function words and fewer English ones than French. */
function looksFrench(value: string): boolean {
  const words = value.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
  if (words.length < 6) return true;
  const french = words.filter((w) => FRENCH_WORDS.has(w)).length;
  const english = words.filter((w) => ENGLISH_WORDS.has(w)).length;
  return french > 0 && english <= french;
}

const safeText = (max: number, french = false) =>
  z
    .string()
    .min(1)
    .max(max)
    .superRefine((value, ctx) => {
      for (const problem of textProblems(value, french)) ctx.addIssue({ code: "custom", message: problem });
    });

const frenchText = (max: number) => safeText(max, true);

const direction = z.enum(["up", "stable", "down"]);
const sourceId = z.string().regex(/^[A-Za-z0-9_-]{1,32}$/);

export const sourceSchema = z.strictObject({
  id: sourceId,
  title: safeText(120),
  titleFr: frenchText(120),
  publisher: safeText(60),
  url: z.string().max(2048),
  publishedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/)
    .nullable(),
});

const fuelSchema = z.strictObject({
  fuel: z.enum(FUELS),
  direction,
  confidence: z.enum(["low", "medium", "high"]),
  horizonDays: z.int().min(3).max(10),
  summary: frenchText(280),
});

const driverSchema = z.strictObject({
  title: frenchText(80),
  impact: z.enum(["up", "down", "neutral"]),
  explanation: frenchText(240),
  sourceIds: z.array(sourceId).max(10),
});

/** What the model is asked to return, all text in French. Also sent to the model as the JSON schema. */
export const modelBriefSchema = z.strictObject({
  headline: frenchText(120),
  fuels: z.array(fuelSchema).min(1).max(FUELS.length),
  drivers: z.array(driverSchema).min(1).max(6),
  sources: z.array(sourceSchema).max(10),
});

export type ModelBrief = z.infer<typeof modelBriefSchema>;

/** Same shape, but sources are checked one by one so a bad source is dropped instead of sinking the brief. */
const envelopeSchema = modelBriefSchema.extend({ sources: z.array(z.unknown()).max(10) });

export type BriefValidation =
  | { ok: true; brief: ModelBrief; dropped: string[] }
  | { ok: false; errors: string[] };

/**
 * Parses the model's raw text. Any unsafe text rejects the whole brief; a source whose URL is not https
 * or was not returned by the search tool is dropped, along with references to it.
 */
export function validateBrief(rawText: string, searchUrls: ReadonlySet<string>): BriefValidation {
  let json: unknown;
  try {
    json = JSON.parse(stripJsonFence(rawText));
  } catch {
    return { ok: false, errors: ["not JSON"] };
  }
  const envelope = envelopeSchema.safeParse(json);
  if (!envelope.success) {
    return { ok: false, errors: envelope.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  }

  const dropped: string[] = [];
  const sources: ModelBrief["sources"] = [];
  for (const [index, candidate] of envelope.data.sources.entries()) {
    const source = sourceSchema.safeParse(candidate);
    const problem = !source.success
      ? source.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
      : !isHttps(source.data.url)
        ? "URL is not https"
        : !searchUrls.has(source.data.url)
          ? "URL was not returned by the search"
          : sources.some((s) => s.id === source.data.id)
            ? "duplicate id"
            : null;
    if (problem || !source.success) dropped.push(`sources.${index}: ${problem}`);
    else sources.push(source.data);
  }

  const fuels = envelope.data.fuels;
  if (new Set(fuels.map((f) => f.fuel)).size !== fuels.length) return { ok: false, errors: ["fuels: duplicate fuel"] };

  const kept = new Set(sources.map((s) => s.id));
  const drivers = envelope.data.drivers.map((driver) => ({
    ...driver,
    sourceIds: driver.sourceIds.filter((id) => kept.has(id)),
  }));
  return { ok: true, brief: { ...envelope.data, drivers, sources }, dropped };
}

function isHttps(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

/** Models sometimes wrap JSON in a code fence; nothing outside the object is kept. */
function stripJsonFence(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? text.slice(start, end + 1) : text;
}

/** JSON schema of `modelBriefSchema`, for the prompt (and `response_format` where the API supports it). */
export function briefJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(modelBriefSchema, { target: "draft-7", unrepresentable: "any" }) as Record<string, unknown>;
}
