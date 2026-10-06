import type { FuelId } from "@/domain/fuels";
import type { Station } from "@/domain/schema";

const RECENT_MS = 7 * 24 * 3_600_000;

export interface StationOffer {
  station: Station;
  price: number;
  updatedAt: string;
}

/** Stations selling `fuel` with a price posted within the week before the snapshot, cheapest first. */
export function recentOffers(stations: Station[], fuel: FuelId, snapshotAt: string): StationOffer[] {
  const cutoff = Date.parse(`${snapshotAt}Z`) - RECENT_MS;
  const offers: StationOffer[] = [];
  for (const station of stations) {
    const price = station.prices.find((p) => p.fuel === fuel);
    if (price && Date.parse(`${price.updatedAt}Z`) >= cutoff) {
      offers.push({ station, price: price.price, updatedAt: price.updatedAt });
    }
  }
  return offers.sort((a, b) => a.price - b.price);
}
