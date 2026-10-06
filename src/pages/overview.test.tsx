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
  expect(html).toContain(escape(insights.brief.headline.fr));
  expect(html).toContain(escape(insights.brief.drivers[0].title.fr));
  expect(html).not.toContain(escape(insights.brief.headline.en));
  expect(html).not.toContain("Likely");
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
