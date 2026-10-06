import { FUEL_INFO, type FuelId } from "@/domain/fuels";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { fuelColor } from "@/lib/fuel-colors";
import { cn } from "@/lib/utils";

export function FuelDot({ fuel, className }: { fuel: FuelId; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2.5 shrink-0 rounded-full", className)}
      style={{ backgroundColor: fuelColor(fuel) }}
    />
  );
}

interface SingleProps {
  fuels: readonly FuelId[];
  value: FuelId;
  onChange: (fuel: FuelId) => void;
  className?: string;
}

/** Pick one fuel. */
export function FuelPicker({ fuels, value, onChange, className }: SingleProps) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={value}
      onValueChange={(next) => next && onChange(next as FuelId)}
      className={cn("flex-wrap", className)}
    >
      {fuels.map((fuel) => (
        <ToggleGroupItem key={fuel} value={fuel} className="gap-1.5 px-2.5">
          <FuelDot fuel={fuel} className="size-2" />
          {FUEL_INFO[fuel].label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

interface MultiProps {
  fuels: readonly FuelId[];
  value: FuelId[];
  onChange: (fuels: FuelId[]) => void;
  className?: string;
}

/** Toggle several fuels on and off; at least one stays selected. */
export function FuelToggles({ fuels, value, onChange, className }: MultiProps) {
  return (
    <ToggleGroup
      type="multiple"
      variant="outline"
      size="sm"
      value={value}
      onValueChange={(next) => next.length && onChange(fuels.filter((f) => next.includes(f)))}
      className={cn("flex-wrap", className)}
    >
      {fuels.map((fuel) => (
        <ToggleGroupItem key={fuel} value={fuel} className="gap-1.5 px-2.5 data-[state=off]:opacity-60">
          <FuelDot fuel={fuel} className="size-2" />
          {FUEL_INFO[fuel].label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
