import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { FUEL_INFO, type FuelId } from "@/domain/fuels";
import type { DailySeries } from "@/domain/schema";
import { PriceTooltip } from "@/components/price-tooltip";
import { RangeTabs } from "@/components/range-tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { fuelColor } from "@/lib/fuel-colors";
import { useI18n } from "@/lib/i18n";
import { toRows, type Range } from "@/lib/series";

interface Props {
  fuel: FuelId;
  placeName: string;
  place: DailySeries;
  national: DailySeries;
}

export function ComparisonChart({ fuel, placeName, place, national }: Props) {
  const { t, date } = useI18n();
  const [range, setRange] = useState<Range>("6M");
  const rows = useMemo(
    () =>
      toRows(
        {
          place: { start: place.start, values: place.values[fuel] },
          france: { start: national.start, values: national.values[fuel] },
        },
        range,
      ),
    [place, national, fuel, range],
  );
  const config: ChartConfig = {
    place: { label: `${placeName} · ${FUEL_INFO[fuel].label}`, color: fuelColor(fuel) },
    france: { label: t("nationalAverage"), color: "var(--muted-foreground)" },
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1.5">
          <CardTitle>{t("comparisonTitle")}</CardTitle>
          <CardDescription>{t("comparisonDescription")}</CardDescription>
        </div>
        <RangeTabs value={range} onChange={setRange} />
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        <ChartContainer config={config} className="aspect-auto h-72 w-full">
          <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={40}
              tickFormatter={(value: string) => date(value)}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={44}
              domain={["auto", "auto"]}
              tickFormatter={(value: number) => value.toFixed(2)}
            />
            <ChartTooltip cursor={{ strokeWidth: 1 }} content={<PriceTooltip config={config} />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Line
              dataKey="france"
              type="monotone"
              stroke="var(--color-france)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              dataKey="place"
              type="monotone"
              stroke="var(--color-place)"
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
