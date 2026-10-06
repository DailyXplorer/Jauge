export const FUELS = ["gazole", "sp95", "e10", "sp98", "e85", "gplc"] as const;

export type FuelId = (typeof FUELS)[number];

export interface FuelInfo {
  id: FuelId;
  label: string;
  /** Name used in the official XML feeds. */
  sourceName: string;
}

export const FUEL_INFO: Record<FuelId, FuelInfo> = {
  gazole: { id: "gazole", label: "Gazole", sourceName: "Gazole" },
  sp95: { id: "sp95", label: "SP95", sourceName: "SP95" },
  e10: { id: "e10", label: "E10", sourceName: "E10" },
  sp98: { id: "sp98", label: "SP98", sourceName: "SP98" },
  e85: { id: "e85", label: "E85", sourceName: "E85" },
  gplc: { id: "gplc", label: "GPLc", sourceName: "GPLc" },
};

const BY_SOURCE_NAME = new Map(FUELS.map((id) => [FUEL_INFO[id].sourceName, id]));

export function fuelFromSourceName(name: string): FuelId | undefined {
  return BY_SOURCE_NAME.get(name);
}
