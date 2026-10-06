import { Area, AreaChart, YAxis } from "recharts";
import { FUEL_INFO, FUELS } from "@/domain/fuels";
import type { DailySeries } from "@/domain/schema";
import { ChangeBadge } from "@/components/change-badge";
import { FuelDot } from "@/components/fuel-picker";
import { Card, CardContent } from "@/components/ui/card";
import { ChartContainer } from "@/components/ui/chart";
import { fuelColor, FUEL_CHART_CONFIG } from "@/lib/fuel-colors";
import { useI18n } from "@/lib/i18n";
import { summarise, type FuelSummary } from "@/lib/series";

export function KpiCards({ series }: { series: DailySeries }) {
  const summaries = FUELS.map((fuel) => summarise(series, fuel)).filter((s): s is FuelSummary => s !== null);
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {summaries.map((summary) => (
        <KpiCard key={summary.fuel} summary={summary} />
      ))}
    </div>
  );
}

function KpiCard({ summary }: { summary: FuelSummary }) {
  const { price, t } = useI18n();
  const gradientId = `spark-${summary.fuel}`;
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardContent className="flex items-end justify-between gap-4 p-5">
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <FuelDot fuel={summary.fuel} />
            {FUEL_INFO[summary.fuel].label}
          </div>
          <div className="text-3xl font-semibold tracking-tight tabular-nums">{price(summary.current)}</div>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <ChangeBadge cents={summary.change7} label={t("vs7d")} />
            <ChangeBadge cents={summary.change30} label={t("vs30d")} />
          </div>
        </div>
        <ChartContainer config={FUEL_CHART_CONFIG} className="aspect-auto h-16 w-28 shrink-0" aria-hidden>
          <AreaChart data={summary.spark} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={fuelColor(summary.fuel)} stopOpacity={0.3} />
                <stop offset="100%" stopColor={fuelColor(summary.fuel)} stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis hide domain={["dataMin", "dataMax"]} />
            <Area
              dataKey="value"
              type="monotone"
              stroke={fuelColor(summary.fuel)}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              isAnimationActive={false}
              connectNulls
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
