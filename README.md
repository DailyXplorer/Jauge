# Jauge

Jauge is an open-source dashboard of French fuel prices. It shows daily averages for France, each
region, department and city, the cheapest stations right now, and a simple, explainable trend for
the next 7 days. There is no AI and no hidden model: every number comes from official open data and
a linear regression you can read in `scripts/data/trend.ts`.

Six fuels: Gazole, SP95, E10, SP98, E85, GPLc. UI in English and French, light and dark mode.

![Screenshot placeholder](docs/screenshot.png)

## Quick start

```sh
pnpm install && pnpm data:build && pnpm dev
```

The dev server listens on http://localhost:5174 and on your LAN (`server.host: true`). Hosts under
`.trycloudflare.com` are allowed, so a Cloudflare quick tunnel works:

```sh
cloudflared tunnel --url http://localhost:5174
```

Other scripts:

| Script              | What it does                                                                 |
| ------------------- | ---------------------------------------------------------------------------- |
| `pnpm data:build`   | Downloads all sources (cached in `data-cache/`) and writes `public/data/`.   |
| `pnpm data:refresh` | Keeps the cached yearly archives, fetches recent days, the instant feed and market data, then rebuilds. |
| `pnpm build`        | Type-checks and builds the static site into `dist/`.                         |
| `pnpm lint`         | ESLint.                                                                      |

There is no backend. The app is static and lazily loads the JSON files it needs.

## Data sources and licences

| Source | Used for | Licence |
| ------ | -------- | ------- |
| [prix-carburants.gouv.fr open data](https://www.prix-carburants.gouv.fr/rubrique/opendata/): yearly archives, daily files for the last 30 days, instant feed with stock-outs | Pump prices, stations, stock-outs | [Licence Ouverte / Etalab 2.0](https://www.etalab.gouv.fr/licence-ouverte-open-licence/) |
| [FRED, series DCOILBRENTEU](https://fred.stlouisfed.org/series/DCOILBRENTEU) (source: U.S. EIA) | Brent crude, USD per barrel | Public domain (EIA), via FRED |
| [ECB reference rate EXR.D.USD.EUR.SP00.A](https://data.ecb.europa.eu/data/datasets/EXR) | EUR/USD, to convert Brent to €/bbl | ECB, reuse with attribution |
| [geo.api.gouv.fr](https://geo.api.gouv.fr/) (INSEE COG) | Postcode → commune, department, region | Licence Ouverte / Etalab 2.0 |

## Data pipeline

`scripts/data/build.ts` downloads two full years, the current year and the last 30 days, streams
each zipped ISO-8859-1 XML file through `saxes`, and writes compact pre-aggregated files:

```
public/data/
  meta.json                 date range, station count, regions, departments, cities
  series/fr.json            national daily average per fuel
  series/region-<code>.json daily average per region
  series/dept-<code>.json   department average plus each city with ≥ 3 active stations
  stations/<region>.json    latest station snapshot: address, prices, update time, stock-outs
  ranking.json              latest average per region and fuel
  brent.json                Brent in €/bbl and $/bbl per calendar day
  trend.json                trend per fuel, with its backtest
```

Prices are stored as integers in thousandths of a euro (1789 = 1.789 €/L). Series are one array
per fuel from a start date, so the files compress well with gzip.

Cleaning rules:

- Prices published in thousandths (older archives) are normalised; values below 0.50 €/L or above
  4.00 €/L are dropped.
- A price more than 30% away from that day's national median for the same fuel is treated as a
  misreport. These are usually an SP98 price posted as E85 or GPLc.
- A station keeps its last price for up to 21 days. Each day, every station counts once per fuel
  with the last price it posted before midnight.
- Postcodes are matched to communes by name, with a fallback on the postcode prefix. Corsica
  (2A/2B) and overseas departments are handled.

Measured on a laptop with a fast connection (October 2026 data):

| Run | Time |
| --- | ---- |
| Downloading the three yearly archives (~90 MB) | a few seconds to a few minutes, depending on bandwidth |
| `pnpm data:build`, yearly archives cached, 30 daily files fetched | ~23 s |
| `pnpm data:refresh` | ~17 s, mostly parsing ~1 GB of XML |

Output is about 25 MB over ~130 files. A page loads only a few of them: the overview needs about
500 KB, a place page one series file and one region's stations.

## How the trend works

Pump prices follow crude oil in euros with a delay of one to three weeks. For each fuel, on the
national daily average:

1. Target: the change of the pump price over the next 7 days, in cents per litre.
2. Inputs: the percentage change of Brent in € over a past window, and the pump change of the
   previous 7 days.
3. Ordinary least squares, trying delays of 7, 10, 14 and 21 days and windows of 7 and 14 days.
   The combination with the best R² wins.
4. The latest Brent moves are plugged in. The card shows the expected change, a ± band of one
   residual standard deviation, the most likely direction (up, stable within ±0.5 c, or down) with
   its probability, and one plain sentence. For example: "Brent in € fell 6% over the 14 days to
   29 Sep; pump prices usually follow within ~10 days."

The backtest is walk-forward over the last year. Each day, the model is refitted using only data
available that day, and its direction is compared with what happened 7 days later. The About page
shows the hit rate next to a naive baseline that repeats last week's direction.

### Limits

- Brent is only one driver. Refining margins, taxes, the euro, competition and local events also
  matter.
- FRED publishes Brent a few days late, so the most recent moves can be missing.
- Averages are plain means over stations. They are not weighted by sales volume.
- On the October 2026 data, the model is about as accurate as the naive baseline (59–83%
  depending on the fuel). Treat it as an indication, never as a certainty.

## Stack

Vite, React 19, TypeScript, Tailwind CSS v4, shadcn/ui with charts on Recharts, Phosphor icons and
DM Sans. pnpm.

## Licence

Code: [MIT](LICENSE), © Jauge contributors. Data remains under the licences of its sources.
