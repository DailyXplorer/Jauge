import type { ReactNode } from "react";
import { prerender } from "react-dom/static";
import { expect, test, vi } from "vitest";
import { InsightsCard } from "@/components/insights-card";
import type { InsightsFile } from "@/domain/schema";
import { OverviewPage } from "@/pages/overview";

const DATA = import.meta.glob<string>("/public/data/**/*.json", { query: "?raw", import: "default" });

async function readData(file: string): Promise<string | null> {
  const load = DATA[`/public${file}`];
  return load ? load() : null;
}

async function render(element: ReactNode): Promise<string> {
  const { prelude } = await prerender(element);
  return new Response(prelude).text();
}

async function renderOverview(): Promise<string> {
  vi.stubGlobal("fetch", async (url: string) => {
    const body = await readData(url);
    return new Response(body, { status: body === null ? 404 : 200 });
  });
  return render(<OverviewPage />);
}

const escape = (text: string) => text.replaceAll("'", "&#x27;");

test("the overview renders in French with the AI brief from public/data/insights.json", async () => {
  const insights = JSON.parse((await readData("/data/insights.json"))!) as InsightsFile;
  const html = await renderOverview();
  expect(html).toContain("Prix des carburants en France");
  expect(html).toContain("Tendance des prochains jours");
  expect(html).toContain("Pourquoi les prix bougent");
  expect(html).toContain(escape(insights.brief.headline));
  expect(html).toContain(escape(insights.brief.drivers[0].title));
  expect(html).not.toContain("Likely");
  expect(html).not.toContain("Régression linéaire");
  expect(html).toContain(`aria-expanded="false"`);
  expect(html).toContain(`Sources (${insights.brief.sources.length})`);
  for (const source of insights.brief.sources) expect(html).toContain(escape(source.titleFr ?? source.title));
});

test("a source shows its French title, or its original title in a brief written before French titles", async () => {
  const insights = JSON.parse((await readData("/data/insights.json"))!) as InsightsFile;
  const [first] = insights.brief.sources;
  const sources = [
    { ...first, id: "fr", title: "Oil prices climb as OPEC+ holds output", titleFr: "Le pétrole grimpe, l'OPEP+ maintient sa production" },
    { ...first, id: "old", title: "Refinery strike hits French diesel supply", titleFr: undefined },
  ];
  const html = await render(<InsightsCard insights={{ ...insights, brief: { ...insights.brief, sources } }} />);
  expect(html).toContain(escape("Le pétrole grimpe, l'OPEP+ maintient sa production"));
  expect(html).not.toContain("Oil prices climb as OPEC+ holds output");
  expect(html).toContain("Refinery strike hits French diesel supply");
});

test("each driver shows when its news was published: today, yesterday, or the date", async () => {
  vi.useFakeTimers({ now: new Date("2026-10-06T21:30:00Z"), toFake: ["Date"] });
  try {
    const insights = JSON.parse((await readData("/data/insights.json"))!) as InsightsFile;
    const [driver] = insights.brief.drivers;
    const drivers = [
      // 23:10 in Paris, still 6 October there.
      { ...driver, title: "Facteur du jour", publishedAt: "2026-10-06T21:10:00.000Z" },
      // 00:30 in Paris on 6 October, although still 5 October in UTC.
      { ...driver, title: "Facteur de la nuit", publishedAt: "2026-10-05T22:30:00.000Z" },
      { ...driver, title: "Facteur de la veille", publishedAt: "2026-10-05T08:00:00.000Z" },
      { ...driver, title: "Facteur ancien", publishedAt: "2026-10-03" },
      { ...driver, title: "Facteur sans date", publishedAt: undefined },
    ];
    const html = await render(<InsightsCard insights={{ ...insights, brief: { ...insights.brief, drivers } }} />);
    const dates = [...html.matchAll(/<time datetime="([^"]+)"[^>]*>([^<]+)<\/time>/gi)].map((m) => [m[1], m[2]]);
    expect(dates).toEqual([
      ["2026-10-06T21:10:00.000Z", "aujourd&#x27;hui"],
      ["2026-10-05T22:30:00.000Z", "aujourd&#x27;hui"],
      ["2026-10-05T08:00:00.000Z", "hier"],
      ["2026-10-03", "3 oct."],
    ]);
  } finally {
    vi.useRealTimers();
  }
});
