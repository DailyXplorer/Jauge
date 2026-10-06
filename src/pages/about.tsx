import { Suspense } from "react";
import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { FUEL_INFO } from "@/domain/fuels";
import { FuelDot } from "@/components/fuel-picker";
import { CardSkeleton } from "@/components/loading";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMeta, useTrend } from "@/lib/data";
import { useI18n } from "@/lib/i18n";

const SOURCES = [
  {
    name: "Prix des carburants (prix-carburants.gouv.fr)",
    href: "https://www.prix-carburants.gouv.fr/rubrique/opendata/",
    licence: "Licence Ouverte / Etalab 2.0",
    licenceHref: "https://www.etalab.gouv.fr/licence-ouverte-open-licence/",
  },
  {
    name: "Brent crude, FRED series DCOILBRENTEU (U.S. EIA)",
    href: "https://fred.stlouisfed.org/series/DCOILBRENTEU",
    licence: "Public domain (EIA), via FRED",
    licenceHref: "https://fred.stlouisfed.org/legal/",
  },
  {
    name: "EUR/USD reference rate (European Central Bank)",
    href: "https://data.ecb.europa.eu/data/datasets/EXR",
    licence: "ECB, reuse with attribution",
    licenceHref: "https://www.ecb.europa.eu/services/disclaimer/html/index.en.html",
  },
  {
    name: "Découpage administratif (geo.api.gouv.fr, COG INSEE)",
    href: "https://geo.api.gouv.fr/",
    licence: "Licence Ouverte / Etalab 2.0",
    licenceHref: "https://www.etalab.gouv.fr/licence-ouverte-open-licence/",
  },
];

export function AboutPage() {
  const { t, dict } = useI18n();
  return (
    <article className="mx-auto max-w-3xl space-y-10">
      <header className="space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t("aboutTitle")}</h1>
        <p className="text-lg leading-relaxed text-muted-foreground">{t("aboutIntro")}</p>
        <Suspense fallback={null}>
          <Coverage />
        </Suspense>
      </header>

      <Section title={t("aboutSourcesTitle")}>
        <ul className="space-y-3">
          {SOURCES.map((source) => (
            <li key={source.href} className="rounded-lg border p-4">
              <a href={source.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium hover:underline">
                {source.name}
                <ArrowSquareOutIcon className="size-4" aria-hidden />
              </a>
              <div className="text-sm text-muted-foreground">
                <a href={source.licenceHref} target="_blank" rel="noreferrer" className="hover:underline">
                  {source.licence}
                </a>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t("aboutMethodTitle")}>
        <p>{t("aboutMethod")}</p>
      </Section>

      <Suspense fallback={<CardSkeleton />}>
        <TrendMethod />
      </Suspense>

      <Section title={t("aboutLimitsTitle")}>
        <ul className="list-disc space-y-2 pl-5">
          {dict.aboutLimits.map((limit) => (
            <li key={limit}>{limit}</li>
          ))}
        </ul>
      </Section>

      <p className="text-sm text-muted-foreground">{t("aboutCode")}</p>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 leading-relaxed">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

function Coverage() {
  const { t, date, integer, dateTime } = useI18n();
  const meta = useMeta();
  return (
    <p className="text-sm text-muted-foreground">
      {t("coverage", {
        from: date(meta.firstDate, "long"),
        to: date(meta.lastDate, "long"),
        stations: integer(meta.stationCount),
      })}{" "}
      {t("generated", { date: dateTime(meta.generatedAt.slice(0, 19)) })}
    </p>
  );
}

function TrendMethod() {
  const { t, percent, date } = useI18n();
  const trend = useTrend();
  const backtest = trend.fuels[0]?.backtest;
  return (
    <>
      <Section title={t("aboutTrendTitle")}>
        <p>{t("aboutTrend1")}</p>
        <p>{t("aboutTrend2", { threshold: trend.stableThresholdCents.toLocaleString() })}</p>
      </Section>
      <Section title={t("aboutBacktestTitle")}>
        <p>{t("aboutBacktest")}</p>
        <Card className="py-0">
          <CardHeader className="sr-only">
            <CardTitle>{t("aboutBacktestTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto px-0">
            <table className="w-full text-sm tabular-nums">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b">
                  <th className="px-4 py-3 font-medium">{t("aboutBacktestFuel")}</th>
                  <th className="px-4 py-3 text-right font-medium">{t("aboutBacktestModel")}</th>
                  <th className="px-4 py-3 text-right font-medium">{t("aboutBacktestBaseline")}</th>
                  <th className="px-4 py-3 text-right font-medium">{t("aboutBacktestFit")}</th>
                  <th className="px-4 py-3 text-right font-medium">{t("aboutBacktestLag")}</th>
                </tr>
              </thead>
              <tbody>
                {trend.fuels.map((fuel) => (
                  <tr key={fuel.fuel} className="border-b last:border-0">
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2">
                        <FuelDot fuel={fuel.fuel} />
                        {FUEL_INFO[fuel.fuel].label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{percent(fuel.backtest.hitRate * 100, false, 0)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {percent(fuel.backtest.baselineHitRate * 100, false, 0)}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{fuel.r2.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {fuel.lagDays} / {fuel.windowDays} {t("daysShort")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
        {backtest && (
          <p className="text-sm text-muted-foreground">
            {date(backtest.from, "long")} → {date(backtest.to, "long")} · n = {backtest.samples}
          </p>
        )}
      </Section>
    </>
  );
}
