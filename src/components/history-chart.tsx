import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { FuelId } from "@/domain/fuels";
import type { DailySeries } from "@/domain/schema";
import { FuelToggles } from "@/components/fuel-picker";
import { PriceTooltip } from "@/components/price-tooltip";
import { RangeTabs } from "@/components/range-tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { fuelColor, FUEL_CHART_CONFIG } from "@/lib/fuel-colors";
import { useI18n } from "@/lib/i18n";
import { fuelsIn, toRows, type Range } from "@/lib/series";

export function HistoryChart({ series }: { series: DailySeries }) {
  const { t, date } = useI18n();
  const available = fuelsIn(series);
  const [selected, setSelected] = useState<FuelId[]>(() => available.filter((f) => f !== "e85" && f !== "gplc"));
  const [range, setRange] = useState<Range>("1Y");
  const fuels = selected.filter((f) => available.includes(f));

  const rows = useMemo(
    () => toRows(Object.fromEntries(fuels.map((f) => [f, { start: series.start, values: series.values[f] }])), range),
    [fuels, series, range],
  );

  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1.5">
            <CardTitle>{t("historyTitle")}</CardTitle>
            <CardDescription>{t("historyDescription")}</CardDescription>
          </div>
          <RangeTabs value={range} onChange={setRange} />
        </div>
        <FuelToggles fuels={available} value={fuels} onChange={setSelected} />
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        <ChartContainer config={FUEL_CHART_CONFIG} className="aspect-auto h-80 w-full sm:h-96">
          <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              {fuels.map((fuel) => (
                <linearGradient key={fuel} id={`history-${fuel}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={fuelColor(fuel)} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={fuelColor(fuel)} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
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
            <ChartTooltip cursor={{ strokeWidth: 1 }} content={<PriceTooltip config={FUEL_CHART_CONFIG} />} />
            {fuels.map((fuel) => (
              <Area
                key={fuel}
                dataKey={fuel}
                type="monotone"
                stroke={fuelColor(fuel)}
                strokeWidth={2}
                fill={`url(#history-${fuel})`}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
