import { Suspense } from "react";
import { FUELS, type FuelId } from "@/domain/fuels";
import { BrentChart } from "@/components/brent-chart";
import { HistoryChart } from "@/components/history-chart";
import { KpiCards } from "@/components/kpi-cards";
import { CardSkeleton, KpiSkeleton } from "@/components/loading";
import { RegionRanking } from "@/components/region-ranking";
import { TrendCards } from "@/components/trend-cards";
import { InsightsCard } from "@/components/insights-card";
import { useBrent, useInsights, useMeta, useNational, useRanking, useTrend } from "@/lib/data";
import { useI18n } from "@/lib/i18n";
import { lastPoint } from "@/lib/series";

export function OverviewPage() {
  const { t, integer, date } = useI18n();
  const meta = useMeta();
  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t("overviewTitle")}</h1>
        <p className="text-muted-foreground">
          {t("overviewSubtitle", { stations: integer(meta.stationCount), date: date(meta.lastDate, "long") })}
        </p>
      </header>
      <Suspense fallback={<KpiSkeleton />}>
        <NationalKpis />
      </Suspense>
      <Suspense fallback={<CardSkeleton className="h-[30rem]" />}>
        <NationalHistory />
      </Suspense>
      <Suspense fallback={<KpiSkeleton />}>
        <Trends />
      </Suspense>
      <Suspense fallback={<CardSkeleton className="h-[32rem]" />}>
        <Insights />
      </Suspense>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Suspense fallback={<CardSkeleton className="h-[28rem]" />}>
          <BrentSection />
        </Suspense>
        <Suspense fallback={<CardSkeleton className="h-[28rem]" />}>
          <RankingSection />
        </Suspense>
      </div>
    </div>
  );
}

function NationalKpis() {
  return <KpiCards series={useNational()} />;
}

function NationalHistory() {
  return <HistoryChart series={useNational()} />;
}

function Trends() {
  return <TrendCards trend={useTrend()} />;
}

function Insights() {
  const insights = useInsights();
  return insights ? <InsightsCard insights={insights} /> : null;
}

function BrentSection() {
  return <BrentChart national={useNational()} brent={useBrent()} />;
}

function RankingSection() {
  const meta = useMeta();
  const national = useNational();
  const ranking = useRanking();
  const latest: Partial<Record<FuelId, number>> = {};
  for (const fuel of FUELS) {
    const point = lastPoint(national.values[fuel]);
    if (point) latest[fuel] = point.value;
  }
  return <RegionRanking ranking={ranking} regions={meta.regions} national={latest} />;
}
