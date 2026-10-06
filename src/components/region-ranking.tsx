import { useState } from "react";
import { Bar, BarChart, LabelList, ReferenceLine, XAxis, YAxis } from "recharts";
import { FUEL_INFO, FUELS, type FuelId } from "@/domain/fuels";
import type { RankingFile, RegionRef } from "@/domain/schema";
import { FuelPicker } from "@/components/fuel-picker";
import { PriceTooltip } from "@/components/price-tooltip";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { fuelColor } from "@/lib/fuel-colors";
import { useI18n } from "@/lib/i18n";
import { navigate, placePath } from "@/lib/router";

interface Props {
  ranking: RankingFile;
  regions: RegionRef[];
  /** National average today per fuel, thousandths of €/L. */
  national: Partial<Record<FuelId, number>>;
}

export function RegionRanking({ ranking, regions, national }: Props) {
  const { t, price } = useI18n();
  const fuels = FUELS.filter((f) => ranking.values[f]);
  const [fuel, setFuel] = useState<FuelId>("gazole");
  const names = new Map(regions.map((r) => [r.code, r.name]));
  const rows = Object.entries(ranking.values[fuel] ?? {})
    .map(([code, value]) => ({ code, name: names.get(code) ?? code, value: value / 1000, date: ranking.date }))
    .sort((a, b) => a.value - b.value);
  const average = national[fuel];
  const config: ChartConfig = { value: { label: FUEL_INFO[fuel].label, color: fuelColor(fuel) } };
  const values = rows.map((r) => r.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max(0.01, (max - min) * 0.15);

  return (
    <Card className="h-full">
      <CardHeader className="gap-4">
        <div className="space-y-1.5">
          <CardTitle>{t("rankingTitle")}</CardTitle>
          <CardDescription>{t("rankingDescription")}</CardDescription>
        </div>
        <FuelPicker fuels={fuels} value={fuel} onChange={setFuel} />
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        <ChartContainer config={config} className="aspect-auto w-full" style={{ height: rows.length * 30 + 24 }}>
          <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 72, bottom: 0, left: 0 }} barCategoryGap={4}>
            <XAxis type="number" hide domain={[Math.max(0, min - pad), max + pad / 2]} />
            <YAxis
              type="category"
              dataKey="name"
              tickLine={false}
              axisLine={false}
              width={150}
              tick={{ fontSize: 12 }}
              interval={0}
            />
            <ChartTooltip cursor={{ fillOpacity: 0.4 }} content={<PriceTooltip config={config} heading={(row) => String(row.name)} />}
            />
            {average !== undefined && (
              <ReferenceLine
                x={average / 1000}
                stroke="var(--muted-foreground)"
                strokeDasharray="4 3"
                label={{ value: t("nationalAverage"), position: "top", fontSize: 11, fill: "var(--muted-foreground)" }}
              />
            )}
            <Bar
              dataKey="value"
              fill="var(--color-value)"
              radius={[0, 4, 4, 0]}
              className="cursor-pointer"
              isAnimationActive={false}
              onClick={(entry: { payload?: { code?: string } }) => {
                if (entry.payload?.code) navigate(placePath("region", entry.payload.code));
              }}
            >
              <LabelList
                dataKey="value"
                position="right"
                className="fill-foreground tabular-nums"
                fontSize={12}
                formatter={(value: unknown) => (typeof value === "number" ? price(Math.round(value * 1000)) : "")}
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
