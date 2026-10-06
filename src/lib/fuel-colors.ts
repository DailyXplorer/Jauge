import { FUEL_INFO, FUELS, type FuelId } from "@/domain/fuels";
import type { ChartConfig } from "@/components/ui/chart";

export const fuelColor = (fuel: FuelId) => `var(--fuel-${fuel})`;

export const FUEL_CHART_CONFIG: ChartConfig = Object.fromEntries(
  FUELS.map((fuel) => [fuel, { label: FUEL_INFO[fuel].label, color: fuelColor(fuel) }]),
);
