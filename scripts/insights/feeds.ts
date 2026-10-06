import type { Fetcher } from "./net";

/**
 * The fixed allowlist of news feeds. Fetched server-side through the job's safe fetch; titles and
 * summaries are passed to the model as untrusted data, and only their links may be cited.
 * Each URL was checked to return RSS with items from the last 72 h on 2026-10-06.
 */
export const FEEDS = [
  { publisher: "Connaissance des Énergies", url: "https://www.connaissancedesenergies.org/rss.xml" },
  { publisher: "OilPrice.com", url: "https://oilprice.com/rss/main" },
  { publisher: "Rigzone", url: "https://www.rigzone.com/news/rss/rigzone_latest.aspx" },
  { publisher: "U.S. EIA", url: "https://www.eia.gov/rss/todayinenergy.xml" },
  { publisher: "CNBC Energy", url: "https://www.cnbc.com/id/19836768/device/rss/rss.html" },
  { publisher: "CNBC Economy", url: "https://www.cnbc.com/id/20910258/device/rss/rss.html" },
  { publisher: "BCE", url: "https://www.ecb.europa.eu/rss/press.html" },
  {
    publisher: "Google News FR",
    url: "https://news.google.com/rss/search?q=prix+carburants+OR+p%C3%A9trole+OR+Brent+OR+raffinerie+OR+TICPE+when:3d&hl=fr&gl=FR&ceid=FR:fr",
  },
  {
    publisher: "Google News EN",
    url: "https://news.google.com/rss/search?q=Brent+OR+OPEC+OR+diesel+OR+refinery+OR+Hormuz+when:3d&hl=en-GB&gl=GB&ceid=GB:en",
  },
  {
    publisher: "Google News macro",
    url: "https://news.google.com/rss/search?q=Fed+OR+ECB+OR+inflation+OR+PMI+OR+%22Red+Sea%22+OR+%22Russia+sanctions%22+oil+when:3d&hl=en-GB&gl=GB&ceid=GB:en",
  },
] as const;

export const FEED_HOSTS = [...new Set(FEEDS.map((feed) => new URL(feed.url).hostname))];

export interface FeedItem {
  id: string;
  title: string;
  url: string;
  publisher: string;
  /** Full ISO timestamp; items without a parseable date are dropped. */
  publishedAt: string;
  summary: string;
}

export const FEED_LIMITS = {
  maxAgeMs: 72 * 3_600_000,
  /** Clocks and feeds disagree a little; anything further in the future is dropped as bogus. */
  maxFutureMs: 3_600_000,
  perFeed: 12,
  maxItems: 60,
  /** Size of the news JSON sent to the model. */
  maxChars: 24_000,
} as const;

export async function fetchFeedItems(fetcher: Fetcher, now = new Date()): Promise<FeedItem[]> {
  const results = await Promise.allSettled(
    FEEDS.map(async (feed) => {
      const response = await fetcher(feed.url, { headers: { "user-agent": "jauge-insights" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return parseFeed(await response.text(), feed.publisher, now);
    }),
  );
  return selectRecent(results.flatMap((r) => (r.status === "fulfilled" ? r.value : [])));
}

/** Newest first, capped in count and in total size, with ids `n1`, `n2`, … in that order. */
export function selectRecent(items: Omit<FeedItem, "id">[]): FeedItem[] {
  const sorted = [...items].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const selected: FeedItem[] = [];
  let size = 2;
  for (const item of sorted) {
    if (selected.length >= FEED_LIMITS.maxItems) break;
    const next = { id: `n${selected.length + 1}`, ...item };
    const itemSize = JSON.stringify(next).length + 1;
    if (size + itemSize > FEED_LIMITS.maxChars) break;
    size += itemSize;
    selected.push(next);
  }
  return selected;
}

export function parseFeed(xml: string, publisher: string, now: Date): Omit<FeedItem, "id">[] {
  const items: Omit<FeedItem, "id">[] = [];
  for (const [, body] of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/g)) {
    const title = plain(tag(body, "title"));
    const url = plain(tag(body, "link"));
    const date = Date.parse(plain(tag(body, "pubDate")));
    if (!title || !url.startsWith("https://") || !Number.isFinite(date)) continue;
    const age = now.getTime() - date;
    if (age > FEED_LIMITS.maxAgeMs || age < -FEED_LIMITS.maxFutureMs) continue;
    const source = plain(tag(body, "source"));
    items.push({
      title: title.slice(0, 200),
      url,
      publisher: source || publisher,
      publishedAt: new Date(date).toISOString(),
      summary: plain(tag(body, "description")).slice(0, 300),
    });
    if (items.length >= FEED_LIMITS.perFeed) break;
  }
  return items;
}

function tag(body: string, name: string): string {
  return body.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`))?.[1] ?? "";
}

/** Strips CDATA, tags and entities: the model only ever sees plain text from feeds. */
function plain(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
