import { describe, expect, it } from "vitest";
import { FEED_HOSTS, FEED_LIMITS, FEEDS, parseFeed, selectRecent } from "./feeds";

const NOW = new Date("2026-10-06T12:00:00Z");

function item(title: string, pubDate: string | null, link = `https://news.example.org/${encodeURIComponent(title)}`) {
  return `<item><title><![CDATA[${title}]]></title><link>${link}</link>${pubDate ? `<pubDate>${pubDate}</pubDate>` : ""}<description>&lt;p&gt;Résumé&lt;/p&gt;</description></item>`;
}

describe("parseFeed", () => {
  it("keeps items from the last 72 h with a full timestamp, and drops older, undated or future ones", () => {
    const xml = `<rss><channel>${[
      item("Brent climbs", "Tue, 06 Oct 2026 09:30:00 GMT"),
      item("ECB holds rates", "Sat, 03 Oct 2026 13:00:00 GMT"),
      item("Old OPEC+ meeting", "Sat, 03 Oct 2026 11:00:00 GMT"),
      item("No date", null),
      item("Tomorrow", "Wed, 07 Oct 2026 12:00:00 GMT"),
      item("Plain http", "Tue, 06 Oct 2026 09:00:00 GMT", "http://news.example.org/x"),
    ].join("")}</channel></rss>`;
    expect(parseFeed(xml, "Example", NOW)).toEqual([
      {
        title: "Brent climbs",
        url: "https://news.example.org/Brent%20climbs",
        publisher: "Example",
        publishedAt: "2026-10-06T09:30:00.000Z",
        summary: "Résumé",
      },
      {
        title: "ECB holds rates",
        url: "https://news.example.org/ECB%20holds%20rates",
        publisher: "Example",
        publishedAt: "2026-10-03T13:00:00.000Z",
        summary: "Résumé",
      },
    ]);
  });
});

describe("selectRecent", () => {
  const base = { url: "https://news.example.org/x", publisher: "Example", summary: "" };

  it("orders items newest first and numbers them in that order", () => {
    const items = [
      { ...base, title: "older", publishedAt: "2026-10-05T08:00:00.000Z" },
      { ...base, title: "newest", publishedAt: "2026-10-06T08:00:00.000Z" },
    ];
    expect(selectRecent(items).map((i) => [i.id, i.title])).toEqual([
      ["n1", "newest"],
      ["n2", "older"],
    ]);
  });

  it("caps the number of items and the size of what the model receives", () => {
    const many = Array.from({ length: 100 }, (_, i) => ({
      ...base,
      title: `item ${i}`,
      publishedAt: new Date(NOW.getTime() - i * 60_000).toISOString(),
    }));
    expect(selectRecent(many)).toHaveLength(FEED_LIMITS.maxItems);

    const large = many.map((i) => ({ ...i, summary: "x".repeat(300), title: "y".repeat(200) }));
    const selected = selectRecent(large);
    expect(JSON.stringify(selected).length).toBeLessThanOrEqual(FEED_LIMITS.maxChars);
    expect(selected.length).toBeLessThan(FEED_LIMITS.maxItems);
    expect(selected[0].title).toBe(large[0].title);
  });
});

describe("FEEDS", () => {
  it("stays a short https allowlist whose hosts are the only feed hosts the job may contact", () => {
    expect(FEEDS.length).toBeLessThanOrEqual(10);
    expect(FEEDS.every((feed) => feed.url.startsWith("https://"))).toBe(true);
    expect(FEED_HOSTS).toEqual([
      "www.connaissancedesenergies.org",
      "oilprice.com",
      "www.rigzone.com",
      "www.eia.gov",
      "www.cnbc.com",
      "www.ecb.europa.eu",
      "news.google.com",
    ]);
  });
});
