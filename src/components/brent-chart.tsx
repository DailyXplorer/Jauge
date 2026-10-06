import { useMemo, useState } from "react";
import { CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";
import { FUEL_INFO, type FuelId } from "@/domain/fuels";
import type { BrentFile, DailySeries } from "@/domain/schema";
import { FuelPicker } from "@/components/fuel-picker";
import { PriceTooltip } from "@/components/price-tooltip";
import { RangeTabs } from "@/components/range-tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { fuelColor } from "@/lib/fuel-colors";
import { useI18n } from "@/lib/i18n";
import { fuelsIn, toRows, type Range } from "@/lib/series";

const DAY_MS = 86_400_000;

export function BrentChart({ national, brent }: { national: DailySeries; brent: BrentFile }) {
  const { t, date, euros, price } = useI18n();
  const fuels = fuelsIn(national);
  const [fuel, setFuel] = useState<FuelId>("gazole");
  const [range, setRange] = useState<Range>("1Y");

  const rows = useMemo(() => {
    const brentStart = Date.parse(`${brent.start}T00:00:00Z`);
    return toRows({ pump: { start: national.start, values: national.values[fuel] } }, range).map((row) => ({
      ...row,
      brent: brent.eur[Math.round((Date.parse(`${row.date}T00:00:00Z`) - brentStart) / DAY_MS)] ?? null,
    }));
  }, [national, brent, fuel, range]);

  const config: ChartConfig = {
    pump: { label: FUEL_INFO[fuel].label, color: fuelColor(fuel) },
    brent: { label: t("brentLabel"), color: "var(--brent)" },
  };

  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1.5">
            <CardTitle>{t("brentTitle")}</CardTitle>
            <CardDescription>{t("brentDescription")}</CardDescription>
          </div>
          <RangeTabs value={range} onChange={setRange} />
        </div>
        <FuelPicker fuels={fuels} value={fuel} onChange={setFuel} />
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        <ChartContainer config={config} className="aspect-auto h-72 w-full">
          <ComposedChart data={rows} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
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
              yAxisId="pump"
              tickLine={false}
              axisLine={false}
              width={44}
              domain={["auto", "auto"]}
              tickFormatter={(value: number) => value.toFixed(2)}
            />
            <YAxis
              yAxisId="brent"
              orientation="right"
              tickLine={false}
              axisLine={false}
              width={40}
              domain={["auto", "auto"]}
              tickFormatter={(value: number) => value.toFixed(0)}
            />
            <ChartTooltip
              cursor={{ strokeWidth: 1 }}
              content={
                <PriceTooltip
                  config={config}
                  format={(value, key) => (key === "brent" ? `${euros(value, 2)}/baril` : price(Math.round(value * 1000)))}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Line
              yAxisId="pump"
              dataKey="pump"
              type="monotone"
              stroke="var(--color-pump)"
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              yAxisId="brent"
              dataKey="brent"
              type="monotone"
              stroke="var(--color-brent)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          </ComposedChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
