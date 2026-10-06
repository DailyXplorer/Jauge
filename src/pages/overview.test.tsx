import { prerender } from "react-dom/static";
import { expect, test, vi } from "vitest";
import type { InsightsFile } from "@/domain/schema";
import { OverviewPage } from "@/pages/overview";

const DATA = import.meta.glob<string>("/public/data/**/*.json", { query: "?raw", import: "default" });

async function readData(file: string): Promise<string | null> {
  const load = DATA[`/public${file}`];
  return load ? load() : null;
}

async function renderOverview(): Promise<string> {
  vi.stubGlobal("fetch", async (url: string) => {
    const body = await readData(url);
    return new Response(body, { status: body === null ? 404 : 200 });
  });
  const { prelude } = await prerender(<OverviewPage />);
  return new Response(prelude).text();
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
});
