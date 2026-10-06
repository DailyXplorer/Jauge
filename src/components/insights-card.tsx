import {
  ArrowSquareOutIcon,
  CaretDownIcon,
  MinusIcon,
  SparkleIcon,
  TrendDownIcon,
  TrendUpIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { useEffect, useId, useState, type ReactNode } from "react";
import { FUEL_INFO, FUELS } from "@/domain/fuels";
import type { DriverImpact, FuelInsight, InsightsFile, MarketDriver, NewsSource, TrendDirection } from "@/domain/schema";
import { DIRECTION } from "@/components/direction";
import { FuelDot } from "@/components/fuel-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LOCALE, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const STALE_AFTER_MS = 2 * 3_600_000;

const IMPACT = {
  up: { icon: TrendUpIcon, key: "insightsImpactUp", tone: "text-up bg-up/10" },
  down: { icon: TrendDownIcon, key: "insightsImpactDown", tone: "text-down bg-down/10" },
  neutral: { icon: MinusIcon, key: "insightsImpactNeutral", tone: "text-muted-foreground bg-muted" },
} as const satisfies Record<DriverImpact, unknown>;

const CONFIDENCE = {
  low: "insightsConfidenceLow",
  medium: "insightsConfidenceMedium",
  high: "insightsConfidenceHigh",
} as const;

/**
 * The AI market brief. Every string comes from the validated `insights.json` and is rendered as plain
 * React text; links only ever point at the https URLs the job checked against the search results.
 */
export function InsightsCard({ insights }: { insights: InsightsFile }) {
  const { t } = useI18n();
  const { brief } = insights;
  const now = useNow();
  const age = now - Date.parse(insights.generatedAt);
  const stale = insights.stale || age > STALE_AFTER_MS;
  const fuels = FUELS.flatMap((id) => brief.fuels.filter((f) => f.fuel === id));
  const sourcesById = new Map(brief.sources.map((s) => [s.id, s]));

  return (
    <Card className="gap-6">
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-xl tracking-tight">
            <SparkleIcon weight="fill" className="size-5 text-primary" aria-hidden />
            {t("insightsTitle")}
          </CardTitle>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
              stale ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : "bg-muted text-muted-foreground",
            )}
          >
            {stale && <WarningIcon weight="bold" className="size-3.5" aria-hidden />}
            {t(stale ? "insightsStale" : "insightsFresh", { age: relativeAge(age) })}
          </span>
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="space-y-4">
          <p className="text-lg leading-snug font-medium text-pretty">{brief.headline}</p>
          <ul className="divide-y rounded-lg border">
            {fuels.map((fuel) => (
              <FuelRow key={fuel.fuel} insight={fuel} />
            ))}
          </ul>
        </div>
        <div className="space-y-6">
          <section className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">{t("insightsDrivers")}</h3>
            <ul className="space-y-4">
              {brief.drivers.map((driver, index) => (
                <DriverItem key={index} driver={driver} sources={sourcesById} now={now} />
              ))}
            </ul>
          </section>
          {brief.sources.length > 0 && <SourceList sources={brief.sources} />}
        </div>
      </CardContent>
    </Card>
  );
}

function FuelRow({ insight }: { insight: FuelInsight }) {
  const { t } = useI18n();
  return (
    <li className="space-y-1.5 p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-2 text-sm font-medium">
          <FuelDot fuel={insight.fuel} />
          {FUEL_INFO[insight.fuel].label}
        </span>
        <DirectionBadge direction={insight.direction} label={t("insightsAiView")} />
        <span className="text-xs text-muted-foreground">
          {t(CONFIDENCE[insight.confidence])} · {t("insightsHorizon", { days: insight.horizonDays })}
        </span>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">{insight.summary}</p>
      {insight.conflictsWithPriceModel && insight.priceModelDirection && (
        <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
          <WarningIcon weight="bold" className="size-3.5 shrink-0" aria-hidden />
          {t("insightsPriceModel", { direction: t(DIRECTION[insight.priceModelDirection].key) })}
        </p>
      )}
    </li>
  );
}

function DirectionBadge({ direction, label }: { direction: TrendDirection; label: string }) {
  const { t } = useI18n();
  const { icon: Icon, key, tone } = DIRECTION[direction];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", tone)}>
      <Icon weight="bold" className="size-3.5" aria-hidden />
      <span className="sr-only">{label}: </span>
      {t(key)}
    </span>
  );
}

function DriverItem({ driver, sources, now }: { driver: MarketDriver; sources: Map<string, NewsSource>; now: number }) {
  const { t } = useI18n();
  const { icon: Icon, key, tone } = IMPACT[driver.impact];
  const cited = driver.sourceIds.flatMap((id) => sources.get(id) ?? []);
  return (
    <li className="flex gap-3">
      <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full", tone)}>
        <Icon weight="bold" className="size-4" aria-label={t(key)} />
      </span>
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium">{driver.title}</p>
        <p className="text-sm leading-relaxed text-muted-foreground">{driver.explanation}</p>
        {(cited.length > 0 || driver.publishedAt) && (
          <p className="flex flex-wrap gap-x-2 text-xs">
            {driver.publishedAt && (
              <time dateTime={driver.publishedAt} className="text-muted-foreground/70">
                {publishedDay(driver.publishedAt, now, t)}
              </time>
            )}
            {cited.map((source) => (
              <ExternalLink
                key={source.id}
                href={source.url}
                className="text-muted-foreground/70 underline-offset-2 hover:text-muted-foreground hover:underline"
              >
                {source.publisher}
              </ExternalLink>
            ))}
          </p>
        )}
      </div>
    </li>
  );
}

function SourceList({ sources }: { sources: NewsSource[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const listId = useId();
  return (
    <section className="space-y-1.5">
      <Button
        variant="ghost"
        size="xs"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
        className="-ml-1.5 text-muted-foreground"
      >
        {`${t("insightsSources")} (${sources.length})`}
        <CaretDownIcon weight="bold" className={cn("transition-transform", open && "rotate-180")} aria-hidden />
      </Button>
      {/* `hidden` rather than unmounting keeps the cited links in the prerendered HTML. */}
      <ul id={listId} hidden={!open} className="space-y-1.5">
        {sources.map((source) => (
          <SourceItem key={source.id} source={source} />
        ))}
      </ul>
    </section>
  );
}

function SourceItem({ source }: { source: NewsSource }) {
  const title = source.titleFr ?? source.title;
  return (
    <li className="text-sm">
      <ExternalLink href={source.url} className="group flex min-w-0 items-center gap-1.5">
        <span title={title} className="truncate underline-offset-2 group-hover:underline">
          {title}
        </span>
        <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">
          {source.publisher}
          {source.publishedAt && ` · ${dateTime(source.publishedAt, source.publishedAt.length === 10)}`}
        </span>
        <ArrowSquareOutIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      </ExternalLink>
    </li>
  );
}

function ExternalLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  // The job only publishes https URLs; re-check here so a hand-edited file cannot inject another scheme.
  if (!href.startsWith("https://")) return <span className={className}>{children}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className={className}>
      {children}
    </a>
  );
}

/** The current time, refreshed every minute so the age and the stale flag stay true on an open page. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function dateTime(iso: string, dateOnly = false): string {
  return new Intl.DateTimeFormat(LOCALE, {
    day: "numeric",
    month: "short",
    ...(dateOnly ? { timeZone: "UTC" } : { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }),
  }).format(new Date(iso));
}

const parisDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" });

/** "aujourd'hui", "hier" or a short date, by calendar day in Paris. A bare `YYYY-MM-DD` is that day. */
function publishedDay(iso: string, now: number, t: ReturnType<typeof useI18n>["t"]): string {
  const day = iso.length === 10 ? iso : parisDay.format(new Date(iso));
  if (day === parisDay.format(now)) return t("insightsToday");
  if (day === parisDay.format(now - 86_400_000)) return t("insightsYesterday");
  return dateTime(day, true);
}

function relativeAge(ms: number): string {
  const format = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) return format.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  return hours < 48 ? format.format(-hours, "hour") : format.format(-Math.round(hours / 24), "day");
}
