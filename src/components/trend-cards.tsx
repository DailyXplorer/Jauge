import { FUEL_INFO } from "@/domain/fuels";
import type { FuelTrend, TrendFile } from "@/domain/schema";
import { DIRECTION } from "@/components/direction";
import { FuelDot } from "@/components/fuel-picker";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function TrendCards({ trend }: { trend: TrendFile }) {
  const { t } = useI18n();
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">{t("trendTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("trendDescription")}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {trend.fuels.map((fuel) => (
          <TrendCard key={fuel.fuel} trend={fuel} />
        ))}
      </div>
    </section>
  );
}

export function TrendCard({ trend }: { trend: FuelTrend }) {
  const { t, cents, percent, date } = useI18n();
  const direction = DIRECTION[trend.direction];
  const Icon = direction.icon;
  const brentKey =
    Math.abs(trend.brentChangePct) < 1 ? "trendBrentFlat" : trend.brentChangePct < 0 ? "trendBrentFell" : "trendBrentRose";
  const explanation = `${t(brentKey, {
    pct: percent(Math.abs(trend.brentChangePct), false),
    window: trend.windowDays,
    date: date(trend.brentWindowEnd),
  })}; ${t("trendFollow", { lag: trend.lagDays })}`;

  return (
    <Card className="gap-4">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <FuelDot fuel={trend.fuel} />
          {FUEL_INFO[trend.fuel].label}
        </CardTitle>
        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", direction.tone)}>
          <Icon weight="bold" className="size-3.5" aria-hidden />
          {t(direction.key)}
        </span>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tracking-tight tabular-nums">{cents(trend.expectedChangeCents)}</span>
          <span className="text-sm text-muted-foreground tabular-nums">± {cents(trend.bandCents, false)} / L</span>
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">
            {t("trendConfidence", { p: Math.round(trend.probability * 100) })}
          </span>
        </div>
        <CardDescription className="leading-relaxed">
          {explanation} {t("trendLastWeek", { change: cents(trend.lastWeekChangeCents) })}
        </CardDescription>
        <p className="text-xs text-muted-foreground">
          {t("trendHitRate", { rate: percent(trend.backtest.hitRate * 100, false, 0) })}
        </p>
      </CardContent>
    </Card>
  );
}
