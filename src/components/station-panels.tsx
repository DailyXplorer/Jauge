import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { MapPinIcon, WarningIcon } from "@phosphor-icons/react";
import { FUEL_INFO, FUELS, type FuelId } from "@/domain/fuels";
import type { Station } from "@/domain/schema";
import { FuelDot } from "@/components/fuel-picker";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { fuelColor } from "@/lib/fuel-colors";
import { useI18n } from "@/lib/i18n";
import type { StationOffer } from "@/lib/offers";

export function PriceHistogram({ offers, fuel }: { offers: StationOffer[]; fuel: FuelId }) {
  const { t, price, integer } = useI18n();
  const bins = histogram(offers.map((o) => o.price));
  const config: ChartConfig = { count: { label: t("stationsLabel"), color: fuelColor(fuel) } };
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("distributionTitle")}</CardTitle>
        <CardDescription>{t("distributionDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        {bins.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t("noStations")}</p>
        ) : (
          <ChartContainer config={config} className="aspect-auto h-64 w-full">
            <BarChart data={bins} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={2}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="from"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={24}
                tickFormatter={(value: number) => (value / 1000).toFixed(2)}
              />
              <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
              <ChartTooltip
                cursor={{ fillOpacity: 0.4 }}
                content={
                  <ChartTooltipContent
                    labelFormatter={(_, payload) => {
                      const bin = payload?.[0]?.payload as { from: number; to: number } | undefined;
                      return bin ? `${price(bin.from)} – ${price(bin.to)}` : null;
                    }}
                    formatter={(value) => (
                      <div className="flex w-full justify-between gap-4">
                        <span className="text-muted-foreground">{t("stationsLabel")}</span>
                        <span className="font-medium tabular-nums">{integer(Number(value))}</span>
                      </div>
                    )}
                  />
                }
              />
              <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Bins of a "nice" width (0.5 to 10 cents) giving at most ~24 bars. `prices` is sorted; the
 * extreme 2% on each side fold into the edge bins so one odd station does not flatten the chart.
 */
function histogram(prices: number[]) {
  if (prices.length === 0) return [];
  const trim = Math.floor(prices.length * 0.02);
  const min = prices[trim];
  const max = prices[prices.length - 1 - trim];
  const width = [5, 10, 20, 50, 100].find((w) => (max - min) / w <= 24) ?? 100;
  const first = Math.floor(min / width) * width;
  const count = Math.floor((max - first) / width) + 1;
  const bins = Array.from({ length: count }, (_, i) => ({ from: first + i * width, to: first + (i + 1) * width, count: 0 }));
  for (const p of prices) bins[Math.max(0, Math.min(count - 1, Math.floor((p - first) / width)))].count++;
  return bins;
}

export function CheapestStations({ offers, fuel }: { offers: StationOffer[]; fuel: FuelId }) {
  const { t, price, dateTime } = useI18n();
  const top = offers.slice(0, 10);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FuelDot fuel={fuel} />
          {t("cheapestTitle")} · {FUEL_INFO[fuel].label}
        </CardTitle>
        <CardDescription>{t("cheapestDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        {top.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t("noStations")}</p>
        ) : (
          <ol className="divide-y">
            {top.map((offer, i) => (
              <li key={offer.station.id} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                <span className="w-5 shrink-0 text-sm text-muted-foreground tabular-nums">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{offer.station.address || offer.station.city}</div>
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span>
                      {offer.station.postcode} {offer.station.city}
                    </span>
                    <span aria-hidden>·</span>
                    <span>{t("updated", { when: dateTime(offer.updatedAt) })}</span>
                    {offer.station.lat !== null && offer.station.lon !== null && (
                      <a
                        className="inline-flex items-center gap-0.5 hover:text-foreground"
                        href={`https://www.openstreetmap.org/?mlat=${offer.station.lat}&mlon=${offer.station.lon}#map=17/${offer.station.lat}/${offer.station.lon}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <MapPinIcon className="size-3.5" aria-hidden />
                        {t("openMap")}
                      </a>
                    )}
                  </div>
                </div>
                <span className="shrink-0 text-base font-semibold tabular-nums">{price(offer.price)}</span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

export function OutOfStock({ stations }: { stations: Station[] }) {
  const { t, integer } = useI18n();
  const counts = FUELS.map((fuel) => ({ fuel, count: stations.filter((s) => s.outOfStock.includes(fuel)).length }));
  const total = stations.filter((s) => s.outOfStock.length > 0).length;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <WarningIcon className="size-5 text-muted-foreground" aria-hidden />
          {t("outOfStockTitle")}
        </CardTitle>
        <CardDescription>{t("outOfStockDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-3xl font-semibold tracking-tight tabular-nums">
          {integer(total)}
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            / {integer(stations.length)} {t("stationsLabel")}
          </span>
        </div>
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">{t("outOfStockNone")}</p>
        ) : (
          <ul className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {counts.map(({ fuel, count }) => (
              <li key={fuel} className="flex items-center gap-2">
                <FuelDot fuel={fuel} className="size-2" />
                {FUEL_INFO[fuel].label}
                <span className="ml-auto font-medium tabular-nums">{integer(count)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
