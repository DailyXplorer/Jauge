import { readFile } from "node:fs/promises";
import { cached } from "./download";
import type { DepartmentRef, RegionRef } from "../../src/domain/schema";

interface ApiCommune {
  nom: string;
  code: string;
  codesPostaux?: string[];
  codeDepartement: string;
  codeRegion: string;
  population?: number;
}

export interface Commune {
  code: string;
  name: string;
  department: string;
  region: string;
  population: number;
}

export interface Place {
  department: string;
  region: string;
  commune: Commune | null;
}

export interface Geography {
  regions: RegionRef[];
  departments: DepartmentRef[];
  /** Resolves a station postcode and free-text city name to its department, region and commune. */
  locate(postcode: string, city: string): Place | null;
}

const GEO_API = "https://geo.api.gouv.fr";

export async function loadGeography(): Promise<Geography> {
  const [communes, departments, regions] = await Promise.all([
    fetchJson<ApiCommune[]>(
      `${GEO_API}/communes?fields=nom,code,codesPostaux,codeDepartement,codeRegion,population&format=json`,
      "geo-communes.json",
    ),
    fetchJson<{ nom: string; code: string; codeRegion: string }[]>(`${GEO_API}/departements`, "geo-departements.json"),
    fetchJson<{ nom: string; code: string }[]>(`${GEO_API}/regions`, "geo-regions.json"),
  ]);

  const departmentRegion = new Map(departments.map((d) => [d.code, d.codeRegion]));
  const byPostcode = new Map<string, Commune[]>();
  const byDepartment = new Map<string, Commune[]>();
  for (const c of communes) {
    const commune: Commune = {
      code: c.code,
      name: c.nom,
      department: c.codeDepartement,
      region: c.codeRegion,
      population: c.population ?? 0,
    };
    for (const postcode of c.codesPostaux ?? []) push(byPostcode, postcode, commune);
    push(byDepartment, c.codeDepartement, commune);
  }
  for (const list of byPostcode.values()) list.sort((a, b) => b.population - a.population);

  function matchByName(candidates: Commune[] | undefined, city: string): Commune | undefined {
    const wanted = normaliseName(city);
    return candidates?.find((c) => normaliseName(c.name) === wanted);
  }

  return {
    regions: regions.map((r) => ({ code: r.code, name: r.nom })),
    departments: departments.map((d) => ({ code: d.code, name: d.nom, region: d.codeRegion })),
    locate(postcode, city) {
      const candidates = byPostcode.get(postcode);
      const commune = matchByName(candidates, city) ?? candidates?.[0];
      if (commune) return { department: commune.department, region: commune.region, commune };

      // CEDEX and other non-distribution postcodes: fall back to the department prefix.
      const department = departmentFromPostcode(postcode);
      const region = department && departmentRegion.get(department);
      if (!department || !region) return null;
      return { department, region, commune: matchByName(byDepartment.get(department), city) ?? null };
    },
  };
}

/** Department code from a postcode, including Corsica (2A/2B) and overseas (97x). */
export function departmentFromPostcode(postcode: string): string | null {
  if (!/^\d{5}$/.test(postcode)) return null;
  if (postcode.startsWith("97") || postcode.startsWith("98")) return postcode.slice(0, 3);
  if (postcode.startsWith("20")) return Number(postcode) < 20200 ? "2A" : "2B";
  return postcode.slice(0, 2);
}

export function normaliseName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\bCEDEX\b.*$/, "")
    .replace(/\bST\b/g, "SAINT")
    .replace(/\bSTE\b/g, "SAINTE")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

async function fetchJson<T>(url: string, name: string): Promise<T> {
  const file = await cached(url, name, { kind: "maxAge", maxAgeHours: 24 * 30 });
  if (!file) throw new Error(`Missing ${url}`);
  return JSON.parse(await readFile(file.path, "utf8")) as T;
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}
