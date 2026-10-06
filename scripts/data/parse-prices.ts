import { SaxesParser, type SaxesTagPlain } from "saxes";
import yauzl from "yauzl";
import type { Readable } from "node:stream";
import { fuelFromSourceName, type FuelId } from "../../src/domain/fuels";

/** One `<pdv>` element of a prix-carburants feed. */
export interface RawStation {
  id: string;
  postcode: string;
  address: string;
  city: string;
  lat: number | null;
  lon: number | null;
  prices: RawPrice[];
  ruptures: RawRupture[];
}

export interface RawPrice {
  fuel: FuelId;
  /** Local timestamp as published, normalised to `YYYY-MM-DDTHH:MM:SS`. */
  updatedAt: string;
  /** Thousandths of a euro per litre. */
  price: number;
}

export interface RawRupture {
  fuel: FuelId;
  start: string;
  end: string;
  temporary: boolean;
}

const MIN_PRICE = 500;
const MAX_PRICE = 4000;

/**
 * Normalises a published price to thousandths of a euro. Older archives publish `1789` for
 * 1.789 €/L, newer ones `1.789`. Returns null for outliers outside 0.5–4 €/L.
 */
export function normalisePrice(raw: string): number | null {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  const thousandths = Math.round(value >= 100 ? value : value * 1000);
  return thousandths < MIN_PRICE || thousandths > MAX_PRICE ? null : thousandths;
}

function normaliseTimestamp(raw: string): string {
  return raw.trim().replace(" ", "T").slice(0, 19);
}

function parseCoordinate(raw: string | undefined): number | null {
  const value = Number(raw);
  if (!raw || !Number.isFinite(value) || value === 0) return null;
  return Math.round((value / 100_000) * 100_000) / 100_000;
}

/** Streams every `<pdv>` of a zipped prix-carburants XML file to `onStation`. */
export async function parseZippedFeed(zipPath: string, onStation: (station: RawStation) => void): Promise<void> {
  const stream = await openFirstEntry(zipPath);
  const parser = new SaxesParser();
  let current: RawStation | null = null;
  let textTarget: "address" | "city" | null = null;
  let text = "";

  parser.on("opentag", (tag: SaxesTagPlain) => {
    const a = tag.attributes as Record<string, string>;
    switch (tag.name) {
      case "pdv":
        current = {
          id: a.id,
          postcode: (a.cp ?? "").trim(),
          address: "",
          city: "",
          lat: parseCoordinate(a.latitude),
          lon: parseCoordinate(a.longitude),
          prices: [],
          ruptures: [],
        };
        break;
      case "adresse":
        textTarget = "address";
        text = "";
        break;
      case "ville":
        textTarget = "city";
        text = "";
        break;
      case "prix": {
        if (!current || !a.nom || !a.valeur || !a.maj) break;
        const fuel = fuelFromSourceName(a.nom);
        const price = normalisePrice(a.valeur);
        if (fuel && price !== null) current.prices.push({ fuel, price, updatedAt: normaliseTimestamp(a.maj) });
        break;
      }
      case "rupture": {
        if (!current || !a.nom) break;
        const fuel = fuelFromSourceName(a.nom);
        if (fuel) {
          current.ruptures.push({
            fuel,
            start: normaliseTimestamp(a.debut ?? ""),
            end: normaliseTimestamp(a.fin ?? ""),
            temporary: a.type === "temporaire",
          });
        }
        break;
      }
    }
  });
  parser.on("text", (value) => {
    if (textTarget) text += value;
  });
  parser.on("closetag", (tag) => {
    if (tag.name === "adresse" || tag.name === "ville") {
      if (current) current[textTarget === "address" ? "address" : "city"] = text.trim();
      textTarget = null;
    } else if (tag.name === "pdv" && current) {
      onStation(current);
      current = null;
    }
  });

  // The feeds are ISO-8859-1: one byte per character, so chunk boundaries never split a character.
  for await (const chunk of stream) parser.write((chunk as Buffer).toString("latin1"));
  parser.close();
}

function openFirstEntry(zipPath: string): Promise<Readable> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (error, zip) => {
      if (error || !zip) return reject(error ?? new Error(`Cannot open ${zipPath}`));
      zip.on("entry", (entry: yauzl.Entry) => {
        if (!entry.fileName.toLowerCase().endsWith(".xml")) return zip.readEntry();
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) return reject(streamError ?? new Error(`Cannot read ${entry.fileName}`));
          stream.on("end", () => zip.close());
          resolve(stream);
        });
      });
      zip.on("end", () => reject(new Error(`No XML entry in ${zipPath}`)));
      zip.readEntry();
    });
  });
}
