import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type Locale = "en" | "fr";

const en = {
  appTagline: "French fuel prices, clearly",
  navOverview: "Overview",
  navAbout: "About",
  searchPlaceholder: "Search a region, department or city…",
  searchButton: "Search a place",
  searchEmpty: "No place found.",
  searchRegions: "Regions",
  searchDepartments: "Departments",
  searchCities: "Cities",
  stationsCount: "stations",
  themeToggle: "Toggle dark mode",
  overviewTitle: "Fuel prices in France",
  overviewSubtitle: "Daily national average across {stations} stations, updated {date}.",
  todayAverage: "Average today",
  vs7d: "7 d",
  vs30d: "30 d",
  historyTitle: "Daily average price",
  historyDescription: "Average of the latest price posted by each station, per day.",
  trendTitle: "Trend for the next days",
  trendDescription: "Estimated direction of the national average over the next 7 days. An indication, not a promise.",
  trendUp: "Likely up",
  trendDown: "Likely down",
  trendStable: "Likely stable",
  trendExpected: "Expected change",
  trendConfidence: "{p}% likely",
  trendBrentFell: "Brent in € fell {pct} over the {window} days to {date}",
  trendBrentRose: "Brent in € rose {pct} over the {window} days to {date}",
  trendBrentFlat: "Brent in € barely moved over the {window} days to {date}",
  trendFollow: "pump prices usually follow within ~{lag} days.",
  trendLastWeek: "Last 7 days at the pump: {change}.",
  trendHitRate: "Right {rate} of the time over the last year.",
  trendUnavailable: "Not enough history to estimate a trend.",
  brentTitle: "Brent vs pump price",
  brentDescription: "Brent crude in €/barrel (right axis) and the national average (left axis).",
  brentLabel: "Brent (€/bbl)",
  rankingTitle: "Regions, cheapest first",
  rankingDescription: "Average price today for the selected fuel.",
  nationalAverage: "National average",
  placeRegion: "Region",
  placeDepartment: "Department",
  placeCity: "City",
  placeSubtitle: "{stations} stations · prices updated {date}",
  comparisonTitle: "Compared with France",
  comparisonDescription: "Daily average here vs the national average.",
  stationsTitle: "Stations right now",
  distributionTitle: "Station prices today",
  distributionDescription: "Number of stations per price band, prices updated within 7 days.",
  cheapestTitle: "10 cheapest stations",
  cheapestDescription: "Prices updated within the last 7 days.",
  outOfStockTitle: "Stock-outs",
  outOfStockDescription: "Stations reporting a temporary shortage right now.",
  outOfStockNone: "No stock-out reported",
  stationsLabel: "stations",
  updated: "Updated {when}",
  noStations: "No station with a recent price for this fuel.",
  noHistory: "Fewer than 3 stations: no daily average is published for this city. Showing current station prices.",
  noData: "No data for this fuel here.",
  openMap: "Open in map",
  back: "Back to France",
  footerData: "Data: prix-carburants.gouv.fr (Licence Ouverte / Etalab 2.0), FRED, ECB, geo.api.gouv.fr.",
  footerDisclaimer: "Trends are statistical indications, not forecasts you can rely on.",
  aboutTitle: "About Jauge",
  aboutIntro:
    "Jauge is an open-source dashboard of French fuel prices. It reads official open data, pre-aggregates it into small static files and draws it. There is no AI and no hidden model: everything below can be checked.",
  aboutSourcesTitle: "Data sources",
  aboutMethodTitle: "How averages are computed",
  aboutMethod:
    "Each day, every station contributes the last price it posted for each fuel, provided it is less than 21 days old. Averages are plain means over stations (not weighted by volume). Prices below 0.50 €/L or above 4.00 €/L are dropped as obvious errors. Cities need at least 3 active stations to get a daily average.",
  aboutTrendTitle: "How the trend is computed",
  aboutTrend1:
    "Pump prices follow crude oil in euros with a delay of one to three weeks. For each fuel we fit, on the national history, a linear regression of the 7-day change of the average pump price on two inputs: the change of Brent in € over a past window, and the pump change of the previous 7 days.",
  aboutTrend2:
    "We try delays of 7, 10, 14 and 21 days and windows of 7 and 14 days and keep the combination that explains history best. The forecast plugs in the latest Brent moves. The direction shown is the most likely of up, stable (within ±{threshold} c) or down, given the spread of past errors; the ± band is one standard deviation of those errors.",
  aboutBacktestTitle: "Backtest",
  aboutBacktest:
    "Walk-forward over the last year: each day, the model is refitted using only data available that day, then its direction is compared with what happened 7 days later. The baseline simply repeats the direction of the previous 7 days.",
  aboutBacktestFuel: "Fuel",
  aboutBacktestModel: "Model",
  aboutBacktestBaseline: "Baseline",
  aboutBacktestFit: "Fit (R²)",
  aboutBacktestLag: "Delay / window",
  daysShort: "d",
  aboutLimitsTitle: "Limits",
  aboutLimits: [
    "Brent is not the only driver: refining margins, taxes, the euro, competition and local events matter too.",
    "Brent data (FRED) is published with a delay of a few days, so the latest moves may be missing.",
    "A station that stops updating keeps its last price for up to 21 days.",
    "Averages are not weighted by sales volume; motorway stations count as much as supermarkets.",
    "The trend is a statistical indication over 7 days. It is often wrong and must never be read as certain.",
  ],
  aboutCode: "Source code under the MIT licence.",
  coverage: "Coverage: {from} to {to}, {stations} active stations.",
  generated: "Data generated {date}.",
  loadError: "Could not load data. Run `pnpm data:build` first.",
  ranges: { "1M": "1M", "3M": "3M", "6M": "6M", "1Y": "1Y", "2Y": "2Y", All: "All" },
};

export type Dictionary = typeof en;

const fr: Dictionary = {
  appTagline: "Les prix des carburants, clairement",
  navOverview: "Vue d'ensemble",
  navAbout: "À propos",
  searchPlaceholder: "Rechercher une région, un département, une ville…",
  searchButton: "Rechercher un lieu",
  searchEmpty: "Aucun lieu trouvé.",
  searchRegions: "Régions",
  searchDepartments: "Départements",
  searchCities: "Villes",
  stationsCount: "stations",
  themeToggle: "Basculer le mode sombre",
  overviewTitle: "Prix des carburants en France",
  overviewSubtitle: "Moyenne nationale quotidienne sur {stations} stations, mise à jour le {date}.",
  todayAverage: "Moyenne du jour",
  vs7d: "7 j",
  vs30d: "30 j",
  historyTitle: "Prix moyen quotidien",
  historyDescription: "Moyenne du dernier prix affiché par chaque station, jour par jour.",
  trendTitle: "Tendance des prochains jours",
  trendDescription: "Direction estimée de la moyenne nationale sur 7 jours. Une indication, pas une promesse.",
  trendUp: "Plutôt en hausse",
  trendDown: "Plutôt en baisse",
  trendStable: "Plutôt stable",
  trendExpected: "Variation attendue",
  trendConfidence: "Probabilité {p} %",
  trendBrentFell: "Le Brent en € a baissé de {pct} sur les {window} jours jusqu'au {date}",
  trendBrentRose: "Le Brent en € a augmenté de {pct} sur les {window} jours jusqu'au {date}",
  trendBrentFlat: "Le Brent en € a peu bougé sur les {window} jours jusqu'au {date}",
  trendFollow: "les prix à la pompe suivent en général sous ~{lag} jours.",
  trendLastWeek: "À la pompe sur 7 jours : {change}.",
  trendHitRate: "Juste dans {rate} des cas sur la dernière année.",
  trendUnavailable: "Historique insuffisant pour estimer une tendance.",
  brentTitle: "Brent et prix à la pompe",
  brentDescription: "Brent en €/baril (axe de droite) et moyenne nationale (axe de gauche).",
  brentLabel: "Brent (€/baril)",
  rankingTitle: "Régions, de la moins chère à la plus chère",
  rankingDescription: "Prix moyen du jour pour le carburant choisi.",
  nationalAverage: "Moyenne nationale",
  placeRegion: "Région",
  placeDepartment: "Département",
  placeCity: "Ville",
  placeSubtitle: "{stations} stations · prix mis à jour le {date}",
  comparisonTitle: "Comparé à la France",
  comparisonDescription: "Moyenne quotidienne ici et moyenne nationale.",
  stationsTitle: "Les stations en ce moment",
  distributionTitle: "Prix des stations aujourd'hui",
  distributionDescription: "Nombre de stations par tranche de prix, prix mis à jour depuis moins de 7 jours.",
  cheapestTitle: "Les 10 stations les moins chères",
  cheapestDescription: "Prix mis à jour au cours des 7 derniers jours.",
  outOfStockTitle: "Ruptures",
  outOfStockDescription: "Stations signalant une rupture temporaire en ce moment.",
  outOfStockNone: "Aucune rupture signalée",
  stationsLabel: "stations",
  updated: "Mis à jour {when}",
  noStations: "Aucune station avec un prix récent pour ce carburant.",
  noHistory: "Moins de 3 stations : pas de moyenne quotidienne publiée pour cette ville. Voici les prix actuels.",
  noData: "Pas de données pour ce carburant ici.",
  openMap: "Voir sur la carte",
  back: "Retour à la France",
  footerData: "Données : prix-carburants.gouv.fr (Licence Ouverte / Etalab 2.0), FRED, BCE, geo.api.gouv.fr.",
  footerDisclaimer: "Les tendances sont des indications statistiques, pas des prévisions fiables.",
  aboutTitle: "À propos de Jauge",
  aboutIntro:
    "Jauge est un tableau de bord open source des prix des carburants en France. Il lit les données ouvertes officielles, les pré-agrège en petits fichiers statiques et les affiche. Pas d'IA, pas de modèle caché : tout ce qui suit est vérifiable.",
  aboutSourcesTitle: "Sources des données",
  aboutMethodTitle: "Calcul des moyennes",
  aboutMethod:
    "Chaque jour, chaque station compte avec le dernier prix affiché pour chaque carburant, s'il date de moins de 21 jours. Les moyennes sont de simples moyennes par station (non pondérées par les volumes). Les prix sous 0,50 €/L ou au-dessus de 4,00 €/L sont écartés comme erreurs manifestes. Une ville doit compter au moins 3 stations actives pour avoir une moyenne quotidienne.",
  aboutTrendTitle: "Calcul de la tendance",
  aboutTrend1:
    "Les prix à la pompe suivent le pétrole brut en euros avec un retard d'une à trois semaines. Pour chaque carburant, on ajuste sur l'historique national une régression linéaire de la variation sur 7 jours du prix moyen à la pompe sur deux entrées : la variation du Brent en € sur une fenêtre passée, et la variation à la pompe des 7 jours précédents.",
  aboutTrend2:
    "On teste des retards de 7, 10, 14 et 21 jours et des fenêtres de 7 et 14 jours, et on garde la combinaison qui explique le mieux l'historique. La prévision applique les derniers mouvements du Brent. La direction affichée est la plus probable entre hausse, stable (à ±{threshold} c près) et baisse, compte tenu de la dispersion des erreurs passées ; la bande ± vaut un écart-type de ces erreurs.",
  aboutBacktestTitle: "Backtest",
  aboutBacktest:
    "Validation glissante sur la dernière année : chaque jour, le modèle est réajusté avec les seules données disponibles ce jour-là, puis sa direction est comparée à ce qui s'est passé 7 jours plus tard. La référence répète simplement la direction des 7 jours précédents.",
  aboutBacktestFuel: "Carburant",
  aboutBacktestModel: "Modèle",
  aboutBacktestBaseline: "Référence",
  aboutBacktestFit: "Ajustement (R²)",
  aboutBacktestLag: "Retard / fenêtre",
  daysShort: "j",
  aboutLimitsTitle: "Limites",
  aboutLimits: [
    "Le Brent n'est pas le seul facteur : marges de raffinage, taxes, euro, concurrence et événements locaux comptent aussi.",
    "Les données du Brent (FRED) sont publiées avec quelques jours de retard ; les derniers mouvements peuvent manquer.",
    "Une station qui ne met plus à jour garde son dernier prix jusqu'à 21 jours.",
    "Les moyennes ne sont pas pondérées par les volumes ; une station d'autoroute pèse autant qu'une grande surface.",
    "La tendance est une indication statistique à 7 jours. Elle se trompe souvent et ne doit jamais être lue comme certaine.",
  ],
  aboutCode: "Code source sous licence MIT.",
  coverage: "Couverture : du {from} au {to}, {stations} stations actives.",
  generated: "Données générées le {date}.",
  loadError: "Impossible de charger les données. Lancez d'abord `pnpm data:build`.",
  ranges: { "1M": "1M", "3M": "3M", "6M": "6M", "1Y": "1A", "2Y": "2A", All: "Tout" },
};

const DICTIONARIES: Record<Locale, Dictionary> = { en, fr };

type StringKey = { [K in keyof Dictionary]: Dictionary[K] extends string ? K : never }[keyof Dictionary];

interface I18n {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  dict: Dictionary;
  t: (key: StringKey, params?: Record<string, string | number>) => string;
  price: (thousandths: number) => string;
  euros: (value: number, digits?: number) => string;
  cents: (value: number, signed?: boolean) => string;
  percent: (value: number, signed?: boolean, digits?: number) => string;
  integer: (value: number) => string;
  date: (iso: string, style?: "short" | "long") => string;
  dateTime: (iso: string) => string;
}

const I18nContext = createContext<I18n | null>(null);
const STORAGE_KEY = "jauge.locale";

function initialLocale(): Locale {
  const stored = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
  return stored === "fr" || stored === "en" ? stored : "en";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback((next: Locale) => {
    localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.lang = next;
    setLocaleState(next);
  }, []);

  const value = useMemo<I18n>(() => {
    const dict = DICTIONARIES[locale];
    const tag = locale === "fr" ? "fr-FR" : "en-GB";
    const fixed = (digits: number) =>
      new Intl.NumberFormat(tag, { minimumFractionDigits: digits, maximumFractionDigits: digits });
    const price3 = fixed(3);
    const one = fixed(1);
    const int = new Intl.NumberFormat(tag);
    const short = new Intl.DateTimeFormat(tag, { day: "numeric", month: "short", timeZone: "UTC" });
    const long = new Intl.DateTimeFormat(tag, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
    const dateTime = new Intl.DateTimeFormat(tag, {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    });
    const sign = (value: number, signed: boolean) => (signed && value > 0 ? "+" : value < 0 ? "−" : "");
    return {
      locale,
      setLocale,
      dict,
      t: (key, params) =>
        (dict[key] as string).replace(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? `{${name}}`)),
      price: (thousandths) => `${price3.format(thousandths / 1000)} €/L`,
      euros: (value, digits = 0) => `${fixed(digits).format(value)} €`,
      cents: (value, signed = true) => `${sign(value, signed)}${one.format(Math.abs(value))} c`,
      percent: (value, signed = true, digits = 1) =>
        `${sign(value, signed)}${fixed(digits).format(Math.abs(value))}${locale === "fr" ? " %" : "%"}`,
      integer: (value) => int.format(value),
      date: (iso, style = "short") => (style === "short" ? short : long).format(new Date(`${iso.slice(0, 10)}T00:00:00Z`)),
      // Station timestamps are French local time without zone; format them as-is.
      dateTime: (iso) => dateTime.format(new Date(`${iso}Z`)),
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useI18n(): I18n {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside I18nProvider");
  return context;
}
