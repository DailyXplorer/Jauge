import type { ReactNode } from "react";
import { ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { useI18n } from "@/lib/i18n";

type TooltipProps = React.ComponentProps<typeof ChartTooltipContent>;

interface Props extends TooltipProps {
  config: ChartConfig;
  /** Formats a value for a given series key; defaults to €/L with 3 decimals. */
  format?: (value: number, key: string) => string;
  /** Header text for the hovered row; defaults to its long date. */
  heading?: (row: Record<string, unknown>) => string;
}

/** Chart tooltip with a header and one row per series: colour, label, formatted value. */
export function PriceTooltip({ config, format, heading, ...props }: Props) {
  const { price, date } = useI18n();
  return (
    <ChartTooltipContent
      {...props}
      className="min-w-44"
      labelFormatter={(_, payload) => {
        const row = payload?.[0]?.payload as Record<string, unknown> | undefined;
        if (!row) return null;
        if (heading) return heading(row);
        return typeof row.date === "string" ? date(row.date, "long") : null;
      }}
      formatter={(value, name, item) => {
        const key = String(name);
        const label: ReactNode = config[key]?.label ?? key;
        const text =
          typeof value === "number" ? (format ? format(value, key) : price(Math.round(value * 1000))) : String(value);
        return (
          <div className="flex w-full items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: item.color }} />
            <span className="text-muted-foreground">{label}</span>
            <span className="ml-auto pl-3 font-medium text-foreground tabular-nums">{text}</span>
          </div>
        );
      }}
    />
  );
}
