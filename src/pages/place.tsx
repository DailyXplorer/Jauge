import { Suspense, useState } from "react";
import { CaretRightIcon } from "@phosphor-icons/react";
import { FUELS, type FuelId } from "@/domain/fuels";
import type { DailySeries, Meta, Station } from "@/domain/schema";
import { ComparisonChart } from "@/components/comparison-chart";
import { FuelPicker } from "@/components/fuel-picker";
import { HistoryChart } from "@/components/history-chart";
import { KpiCards } from "@/components/kpi-cards";
import { PageSkeleton } from "@/components/loading";
import { CheapestStations, OutOfStock, PriceHistogram } from "@/components/station-panels";
import { Card, CardContent } from "@/components/ui/card";
import { useDepartmentSeries, useMeta, useNational, useRegionSeries, useStations } from "@/lib/data";
import { Link } from "@/components/link";
import { useI18n } from "@/lib/i18n";
import { recentOffers } from "@/lib/offers";
import { placePath, type PlaceKind } from "@/lib/router";
import { fuelsIn } from "@/lib/series";
import { NotFoundPage } from "./not-found";

interface Crumb {
  label: string;
  to: string;
}

/** A place resolved from the URL: what to call it, where its stations are, how to select them. */
interface Place {
  kind: PlaceKind;
  name: string;
  region: string;
  /** Department whose series file holds this place, when it is a department or a city. */
  department: string | null;
  crumbs: Crumb[];
  includes: (station: Station) => boolean;
}

function resolve(meta: Meta, kind: PlaceKind, code: string): Place | null {
  const regionCrumb = (regionCode: string): Crumb => ({
    label: meta.regions.find((r) => r.code === regionCode)?.name ?? regionCode,
    to: placePath("region", regionCode),
  });
  if (kind === "region") {
    const region = meta.regions.find((r) => r.code === code);
    return region
      ? { kind, name: region.name, region: code, department: null, crumbs: [], includes: () => true }
      : null;
  }
  if (kind === "department") {
    const department = meta.departments.find((d) => d.code === code);
    return department
      ? {
          kind,
          name: `${department.name} (${department.code})`,
          region: department.region,
          department: code,
          crumbs: [regionCrumb(department.region)],
          includes: (s) => s.department === code,
        }
      : null;
  }
  const city = meta.cities.find((c) => c.code === code);
  const department = city && meta.departments.find((d) => d.code === city.department);
  return city && department
    ? {
        kind,
        name: city.name,
        region: department.region,
        department: department.code,
        crumbs: [
          regionCrumb(department.region),
          { label: `${department.name} (${department.code})`, to: placePath("department", department.code) },
        ],
        includes: (s) => s.cityCode === code,
      }
    : null;
}

export function PlacePage({ kind, code }: { kind: PlaceKind; code: string }) {
  const meta = useMeta();
  const place = resolve(meta, kind, code);
  if (!place) return <NotFoundPage />;
  return (
    <Suspense key={`${kind}-${code}`} fallback={<PageSkeleton />}>
      {kind === "region" ? (
        <RegionPlace place={place} code={code} />
      ) : (
        <DepartmentOrCityPlace place={place} code={code} />
      )}
    </Suspense>
  );
}

function RegionPlace({ place, code }: { place: Place; code: string }) {
  return <PlaceView place={place} series={useRegionSeries(code)} />;
}

function DepartmentOrCityPlace({ place, code }: { place: Place; code: string }) {
  const file = useDepartmentSeries(place.department!);
  const series = place.kind === "department" ? file.department : (file.cities[code] ?? null);
  return <PlaceView place={place} series={series} />;
}

function PlaceView({ place, series }: { place: Place; series: DailySeries | null }) {
  const { t, integer, dateTime } = useI18n();
  const national = useNational();
  const snapshot = useStations(place.region);
  const stations = snapshot.stations.filter(place.includes);
  const fuels = series
    ? fuelsIn(series)
    : FUELS.filter((fuel) => stations.some((s) => s.prices.some((p) => p.fuel === fuel)));
  const [chosen, setChosen] = useState<FuelId>("gazole");
  const fuel = fuels.includes(chosen) ? chosen : (fuels[0] ?? "gazole");
  const offers = recentOffers(stations, fuel, snapshot.snapshotAt);
  const kindLabel = { region: t("placeRegion"), department: t("placeDepartment"), city: t("placeCity") }[place.kind];

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <nav className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground" aria-label="Breadcrumb">
          <Link to="/" className="hover:text-foreground">
            France
          </Link>
          {place.crumbs.map((crumb) => (
            <span key={crumb.to} className="flex items-center gap-1">
              <CaretRightIcon className="size-3" aria-hidden />
              <Link to={crumb.to} className="hover:text-foreground">
                {crumb.label}
              </Link>
            </span>
          ))}
        </nav>
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{kindLabel}</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{place.name}</h1>
          <p className="text-muted-foreground">
            {t("placeSubtitle", { stations: integer(stations.length), date: dateTime(snapshot.snapshotAt) })}
          </p>
        </div>
      </header>

      {series ? (
        <>
          <KpiCards series={series} />
          <HistoryChart series={series} />
        </>
      ) : (
        <Card>
          <CardContent className="text-sm text-muted-foreground">{t("noHistory")}</CardContent>
        </Card>
      )}

      <section className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-semibold tracking-tight">{t("stationsTitle")}</h2>
          <FuelPicker fuels={fuels} value={fuel} onChange={setChosen} />
        </div>
        {series && <ComparisonChart fuel={fuel} placeName={place.name} place={series} national={national} />}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <PriceHistogram offers={offers} fuel={fuel} />
          </div>
          <OutOfStock stations={stations} />
        </div>
        <CheapestStations offers={offers} fuel={fuel} />
      </section>
    </div>
  );
}
