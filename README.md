# Jauge

Jauge is an open-source dashboard of French fuel prices. It shows daily averages for France, each
region, department and city, the cheapest stations right now, and a simple, explainable trend for
the next 7 days. Prices and the trend use no AI and no hidden model: every number comes from official
open data and a linear regression you can read in `scripts/data/trend.ts`. Separately, an optional
AI market brief explains why prices may move, from the news. It is labelled as AI-generated and
never replaces the numeric trend (see [AI market brief](#ai-market-brief)).

Six fuels: Gazole, SP95, E10, SP98, E85, GPLc. French-only UI, light and dark mode.

![Screenshot placeholder](docs/screenshot.png)

## Quick start

```sh
pnpm install && pnpm data:build && pnpm dev
```

The dev server listens on http://localhost:5174 and on your LAN (`server.host: true`).

Other scripts:

| Script              | What it does                                                                 |
| ------------------- | ---------------------------------------------------------------------------- |
| `pnpm data:build`   | Downloads all sources (cached in `data-cache/`) and writes `public/data/`.   |
| `pnpm data:refresh` | Keeps the cached yearly archives, fetches recent days, the instant feed and market data, then rebuilds. |
| `pnpm insights:run` | Writes the AI market brief to `public/data/insights.json` (needs a Mistral key). |
| `pnpm job`          | `data:refresh`, then `insights:run`, under one lock. What the LaunchAgent runs. |
| `pnpm build`        | Type-checks and builds the static site into `dist/`, then runs `check:secrets`. |
| `pnpm check:secrets`| Fails if the Mistral key could leak into `dist/`, `public/`, git or `src/`.  |
| `pnpm test`         | Vitest unit tests.                                                           |
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
available that day, and its direction is compared with what happened 7 days later. Each trend card
shows that hit rate. `public/data/trend.json` also stores, per fuel, a naive baseline that repeats
last week's direction, the R², and the chosen delay and window.

### Limits

- Brent is only one driver. Refining margins, taxes, the euro, competition and local events also
  matter.
- FRED publishes Brent a few days late, so the most recent moves can be missing.
- Averages are plain means over stations. They are not weighted by sales volume.
- On the October 2026 data, the model is about as accurate as the naive baseline (59–83%
  depending on the fuel). Treat it as an indication, never as a certainty.

## AI market brief

Every 30 minutes, a local job asks Mistral one question: what could move French pump prices today,
and where they are likely to go over the next 3 to 10 days. The brief is written in French only. It
is built on news from the last 24 hours, with up to 72 hours as context, and covers the macro
drivers when they are in the news: Brent and WTI, OPEC+, US, China and euro area data (inflation,
PMI, growth), Fed and ECB decisions, EUR/USD, refinery outages and strikes, crack spreads, EIA and
API stocks, Hormuz, the Red Sea, Russia sanctions, and French taxes or rebates. When nothing
material happened, the headline says "Rien de nouveau aujourd'hui" and every fuel is stable with low
confidence. The site only displays the stored result, in the "Pourquoi les prix bougent" card on
the overview, with each driver dated "aujourd'hui", "hier" or by its date.

The news comes from two paths. By default, the job fetches a fixed allowlist of 10 RSS feeds
(`scripts/insights/feeds.ts`: Connaissance des Énergies, OilPrice.com, Rigzone, U.S. EIA, CNBC
Energy and Economy, ECB press releases, and three fixed Google News searches), keeps items
published in the last 72 hours (newest first, at most 60 items and 24,000 characters), and passes
their titles and summaries to the model as untrusted data, with no tool enabled. Mistral's built-in `web_search` is limited to 20 searches per
day and 3 per minute on this account (from the `x-ratelimit-*-web-search-*` headers), so it is used
at most once every 2 hours and only while more than 2 searches remain today. A `web_search` quota
error falls back to the feeds in the same run. The Conversations API is used for both paths,
because this account's chat completions endpoint allows 0 requests per minute.

```sh
cp .env.example .env    # then set the key in .env
chmod 600 .env          # the job refuses to run otherwise
pnpm insights:run
```

The job reads only the three variables below from `.env`, and nothing else in it.

| Variable | Default | |
| -------- | ------- | - |
| `MISTRAL_API_KEY` | none | Server-side only. Never prefix it with `VITE_`. |
| `MISTRAL_MODEL` | `mistral-medium-latest` | Any model that supports `web_search`. |
| `MISTRAL_MIN_REQUEST_INTERVAL_MS` | `1100` | Minimum gap between two API calls. |

### Security model

- **No visitor input reaches the model.** There is no API server, form or query parameter. The model
  receives a fixed system prompt, Jauge's own numbers (latest prices, 7 and 30-day changes, Brent in
  € and $, EUR/USD, the price model's outputs) and the news: allowlisted feed items, or web search
  results. The only tool ever enabled is `web_search`. A source URL must come from those feeds or
  search results.
- **News pages are untrusted.** The prompt says web content is data, never instructions. The answer is
  parsed as JSON and checked with a strict zod schema (`scripts/insights/brief.ts`): length caps,
  enums, French text everywhere except each source's original title, Latin script only. The French
  check counts function words, so names and tickers such as Brent, WTI, OPEC+ or Fed pass. Any HTML, markdown,
  link, script, prompt-injection phrasing, call to action, or mention of prompts, the system or keys
  rejects the whole brief. A source whose URL is not https or was not returned by the search tool is
  dropped. If two attempts fail, the previous brief is kept and marked stale. Raw model text is never
  published.
- **Outbound allowlist.** Every request goes through `createSafeFetch` (`scripts/insights/net.ts`),
  also plugged into the Mistral SDK as its fetcher: https only, exact hosts (`api.mistral.ai` for the
  API, the feed hosts for the feeds), redirects followed only to those hosts, a 2 MB body cap, no
  cookies sent or kept, and a 10 s timeout for feeds. API calls keep a 60 s timeout because measured
  calls take 13 to 55 s.
- **`.env` stays private.** The job refuses to run when `.env` is readable by the group or others,
  and prints the `chmod 600` that fixes it. The data refresh runs as a child process without the
  Mistral variables in its environment.
- **Atomic publishing.** `insights.json` and the limit state are written to a temporary file in the
  same directory, flushed, then renamed, so the site never reads a half-written file. On any failure
  the previous file stays as it was.
- **JSON is enforced by validation, not by the API.** Combining `response_format` (`json_schema` or
  `json_object`) with `web_search` never returned within 75–90 s when tested on 2026-10-06, so the
  schema is in the prompt and the validator is the gate.
- **The numbers win.** The brief never overwrites the numeric trend. When the AI disagrees with the
  price model with high confidence, the card shows both, labelled "AI view" and "Price model".
- **Limits.** One run per 30-minute slot (a run starting less than 28 minutes after the previous one
  exits with code 0; the slack absorbs scheduling jitter), one lock file for `pnpm job` and
  `pnpm insights:run` so a concurrent run exits with code 0, at most 3 API
  calls per run and 60 per UTC day, and a 60 s request timeout. A rate-limit or auth error ends the
  run, except a `web_search` quota error, which falls back to the feeds. State is in
  `data-cache/insights-state.json`.
- **Logs hold metadata only**: time, model, duration, token counts, searches, ok or error kind, in
  `data-cache/insights.log`. API errors are logged by status only, never with their body, and every
  console or file line is redacted of the key and of anything shaped like a key or an auth header.
- **The UI renders plain text** through React, with no `dangerouslySetInnerHTML`. Links open with
  `rel="noopener noreferrer nofollow"`. The card's age badge turns to "Pas à jour" after 2 hours.
- `pnpm check:secrets` runs after every build.

A run makes one API call when the first answer validates. Measured on 2026-10-06 with
`mistral-medium-latest`: a feeds call used about 6,100 prompt and 2,000 completion tokens in 13–15 s;
a `web_search` call used about 2,400 prompt tokens, 50,000 connector tokens (search results read by
the model) and 3,000 to 5,000 completion tokens, in 20 to 55 s.

### Scheduling on a Mac

```sh
scripts/install-launchd.sh               # install or reinstall
scripts/install-launchd.sh --uninstall
```

This installs the user LaunchAgent `~/Library/LaunchAgents/io.jauge.insights.plist`. It runs
`pnpm job` from the project directory every 1,800 s and at login, with
its output in `data-cache/launchd.out.log` and `data-cache/launchd.err.log`. Static hosting must then
redeploy `public/data/insights.json` to publish each new brief.

## Stack

Vite, React 19, TypeScript, Tailwind CSS v4, shadcn/ui with charts on Recharts, Phosphor icons and
DM Sans. pnpm.

## Licence

Code: [MIT](LICENSE), © Jauge contributors. Data remains under the licences of its sources.
