# Jauge

Jauge is an open-source dashboard of French fuel prices. It shows daily averages for France, each
region, department and city, the cheapest stations right now, and a simple, explainable trend for
the next 7 days. Prices and the trend use no AI and no hidden model: every number comes from official
open data and a linear regression you can read in `scripts/data/trend.ts`. Separately, an optional
AI market brief explains why prices may move, from the news. It is labelled as AI-generated and
never replaces the numeric trend (see [AI market brief](#ai-market-brief)).

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
| `pnpm insights:run` | Writes the AI market brief to `public/data/insights.json` (needs a Mistral key). |
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
available that day, and its direction is compared with what happened 7 days later. The About page
shows the hit rate next to a naive baseline that repeats last week's direction.

### Limits

- Brent is only one driver. Refining margins, taxes, the euro, competition and local events also
  matter.
- FRED publishes Brent a few days late, so the most recent moves can be missing.
- Averages are plain means over stations. They are not weighted by sales volume.
- On the October 2026 data, the model is about as accurate as the naive baseline (59–83%
  depending on the fuel). Treat it as an indication, never as a certainty.

## AI market brief

Every 30 minutes, a local job asks Mistral to read the fuel market news (Brent and OPEC+, refinery outages and strikes, crack spreads, EUR/USD, TICPE, supply
risks) and explain in French and English why pump prices may go up or down over the next 3 to 10
days. The site only displays the stored result, in the "Why prices are moving" card on the overview.

The news comes from two paths. By default, the job fetches a fixed allowlist of RSS feeds
(`scripts/insights/feeds.ts`: Connaissance des Énergies, OilPrice.com, U.S. EIA, and two fixed
Google News searches in French and English) and passes their titles and summaries to the model as
untrusted data, with no tool enabled. Mistral's built-in `web_search` is limited to 20 searches per
day and 3 per minute on this account (from the `x-ratelimit-*-web-search-*` headers), so it is used
at most once every 2 hours and only while more than 2 searches remain today. A `web_search` quota
error falls back to the feeds in the same run. The Conversations API is used for both paths,
because this account's chat completions endpoint allows 0 requests per minute.

```sh
cp .env.example .env    # then set the key in .env
pnpm insights:run
```

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
  enums, French text in `fr` fields and English in `en` fields, Latin script only. Any HTML, markdown,
  link, script, prompt-injection phrasing, call to action, or mention of prompts, the system or keys
  rejects the whole brief. A source whose URL is not https or was not returned by the search tool is
  dropped. If two attempts fail, the previous brief is kept and marked stale. Raw model text is never
  published.
- **JSON is enforced by validation, not by the API.** Combining `response_format` (`json_schema` or
  `json_object`) with `web_search` never returned within 75–90 s when tested on 2026-10-06, so the
  schema is in the prompt and the validator is the gate.
- **The numbers win.** The brief never overwrites the numeric trend. When the AI disagrees with the
  price model with high confidence, the card shows both, labelled "AI view" and "Price model".
- **Limits.** One run per 30-minute slot (a run starting less than 28 minutes after the previous one
  exits; the slack absorbs scheduling jitter), a lock file so a concurrent run exits, at most 3 API
  calls per run and 60 per UTC day, and a 60 s request timeout. A rate-limit or auth error ends the
  run, except a `web_search` quota error, which falls back to the feeds. State is in
  `data-cache/insights-state.json`.
- **Logs hold metadata only**: time, model, duration, token counts, searches, ok or error kind, in
  `data-cache/insights.log`.
- **The UI renders plain text** through React, with no `dangerouslySetInnerHTML`. Links open with
  `rel="noopener noreferrer nofollow"`. The card says "Generated by AI from news on … — may be wrong"
  and turns to "Outdated" after 2 hours.
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
`pnpm data:refresh && pnpm insights:run` from the project directory every 1,800 s and at login, with
its output in `data-cache/launchd.out.log` and `data-cache/launchd.err.log`. Static hosting must then
redeploy `public/data/insights.json` to publish each new brief.

## Stack

Vite, React 19, TypeScript, Tailwind CSS v4, shadcn/ui with charts on Recharts, Phosphor icons and
DM Sans. pnpm.

## Licence

Code: [MIT](LICENSE), © Jauge contributors. Data remains under the licences of its sources.
