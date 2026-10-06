const fr = {
  searchPlaceholder: "Rechercher une région, un département, une ville…",
  searchButton: "Rechercher un lieu",
  searchEmpty: "Aucun lieu trouvé.",
  searchRegions: "Régions",
  searchDepartments: "Départements",
  searchCities: "Villes",
  themeToggle: "Basculer le mode sombre",
  overviewTitle: "Prix des carburants en France",
  overviewSubtitle: "Moyenne nationale quotidienne sur {stations} stations, mise à jour le {date}.",
  vs7d: "7 j",
  vs30d: "30 j",
  historyTitle: "Prix moyen quotidien",
  historyDescription: "Moyenne du dernier prix affiché par chaque station, jour par jour.",
  trendTitle: "Tendance des prochains jours",
  trendDescription: "Direction estimée de la moyenne nationale sur 7 jours.",
  trendUp: "Plutôt en hausse",
  trendDown: "Plutôt en baisse",
  trendStable: "Plutôt stable",
  trendConfidence: "Probabilité {p} %",
  trendBrentFell: "Le Brent en € a baissé de {pct} sur les {window} jours jusqu'au {date}",
  trendBrentRose: "Le Brent en € a augmenté de {pct} sur les {window} jours jusqu'au {date}",
  trendBrentFlat: "Le Brent en € a peu bougé sur les {window} jours jusqu'au {date}",
  trendFollow: "les prix à la pompe suivent en général sous ~{lag} jours.",
  trendLastWeek: "À la pompe sur 7 jours : {change}.",
  trendHitRate: "Juste dans {rate} des cas sur la dernière année.",
  insightsTitle: "Pourquoi les prix bougent",
  insightsAiView: "Avis de l'IA",
  insightsStale: "Pas à jour, {age}",
  insightsFresh: "Mis à jour {age}",
  insightsHorizon: "{days} j",
  insightsConfidenceLow: "confiance faible",
  insightsConfidenceMedium: "confiance moyenne",
  insightsConfidenceHigh: "confiance élevée",
  insightsPriceModel: "Modèle de prix : {direction}",
  insightsDrivers: "Facteurs",
  insightsSources: "Sources",
  insightsImpactUp: "Pousse les prix à la hausse",
  insightsImpactDown: "Pousse les prix à la baisse",
  insightsImpactNeutral: "Effet neutre",
  insightsToday: "aujourd'hui",
  insightsYesterday: "hier",
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
  breadcrumb: "Fil d'Ariane",
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
  noHistory:
    "Moins de 3 stations : pas de moyenne quotidienne publiée pour cette ville. Voici les prix actuels.",
  openMap: "Voir sur la carte",
  back: "Retour à la France",
  githubStar: "Star",
  githubStarLabel: "Mettre une étoile à Jauge sur GitHub",
  footerLicence: "Licence MIT",
  footerAttribution: "Données de prix : prix-carburants.gouv.fr (Licence Ouverte)",
  loadError: "Impossible de charger les données. Lancez d'abord `pnpm data:build`.",
  ranges: { "1M": "1M", "3M": "3M", "6M": "6M", "1Y": "1A", "2Y": "2A", All: "Tout" },
};

type Dictionary = typeof fr;
type StringKey = { [K in keyof Dictionary]: Dictionary[K] extends string ? K : never }[keyof Dictionary];

export const LOCALE = "fr-FR";

const fixed = (digits: number) =>
  new Intl.NumberFormat(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits });
const price3 = fixed(3);
const one = fixed(1);
const int = new Intl.NumberFormat(LOCALE);
const short = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", timeZone: "UTC" });
const long = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const stationTime = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});
const sign = (value: number, signed: boolean) => (signed && value > 0 ? "+" : value < 0 ? "−" : "");

const I18N = {
  dict: fr,
  t: (key: StringKey, params?: Record<string, string | number>) =>
    fr[key].replace(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? `{${name}}`)),
  price: (thousandths: number) => `${price3.format(thousandths / 1000)} €/L`,
  euros: (value: number, digits = 0) => `${fixed(digits).format(value)} €`,
  cents: (value: number, signed = true) => `${sign(value, signed)}${one.format(Math.abs(value))} c`,
  percent: (value: number, signed = true, digits = 1) =>
    `${sign(value, signed)}${fixed(digits).format(Math.abs(value))} %`,
  integer: (value: number) => int.format(value),
  date: (iso: string, style: "short" | "long" = "short") =>
    (style === "short" ? short : long).format(new Date(`${iso.slice(0, 10)}T00:00:00Z`)),
  // Station timestamps are French local time without zone; format them as-is.
  dateTime: (iso: string) => stationTime.format(new Date(`${iso}Z`)),
};

/** French strings and fr-FR formatters. A plain constant: there is only one language. */
export const useI18n = () => I18N;
