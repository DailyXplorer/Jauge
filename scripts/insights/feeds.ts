/**
 * The fixed allowlist of news feeds used when `web_search` is not used. Fetched server-side; titles and
 * summaries are passed to the model as untrusted data, and only their links may be cited.
 */
export const FEEDS = [
  { publisher: "Connaissance des Énergies", url: "https://www.connaissancedesenergies.org/rss.xml" },
  { publisher: "OilPrice.com", url: "https://oilprice.com/rss/main" },
  { publisher: "U.S. EIA", url: "https://www.eia.gov/rss/todayinenergy.xml" },
  {
    publisher: "Google News FR",
    url: "https://news.google.com/rss/search?q=prix+carburants+OR+p%C3%A9trole+OR+Brent+OR+raffinerie+when:7d&hl=fr&gl=FR&ceid=FR:fr",
  },
  {
    publisher: "Google News EN",
    url: "https://news.google.com/rss/search?q=Brent+OR+OPEC+OR+diesel+OR+refinery+when:7d&hl=en-GB&gl=GB&ceid=GB:en",
  },
] as const;

export interface FeedItem {
  id: string;
  title: string;
  url: string;
  publisher: string;
  publishedAt: string | null;
  summary: string;
}

const MAX_AGE_MS = 7 * 86_400_000;
const PER_FEED = 12;

export async function fetchFeedItems(now = new Date()): Promise<FeedItem[]> {
  const results = await Promise.allSettled(
    FEEDS.map(async (feed) => {
      const response = await fetch(feed.url, { signal: AbortSignal.timeout(15_000), redirect: "follow" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return parseFeed(await response.text(), feed.publisher, now);
    }),
  );
  const items = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  return items.map((item, index) => ({ ...item, id: `n${index + 1}` }));
}

export function parseFeed(xml: string, publisher: string, now: Date): Omit<FeedItem, "id">[] {
  const items: Omit<FeedItem, "id">[] = [];
  for (const [, body] of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/g)) {
    const title = plain(tag(body, "title"));
    const url = plain(tag(body, "link"));
    const date = Date.parse(plain(tag(body, "pubDate")));
    if (!title || !url.startsWith("https://")) continue;
    if (Number.isFinite(date) && now.getTime() - date > MAX_AGE_MS) continue;
    const source = plain(tag(body, "source"));
    items.push({
      title: title.slice(0, 200),
      url,
      publisher: source || publisher,
      publishedAt: Number.isFinite(date) ? new Date(date).toISOString().slice(0, 10) : null,
      summary: plain(tag(body, "description")).slice(0, 300),
    });
    if (items.length >= PER_FEED) break;
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
