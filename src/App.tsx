import { Suspense, useState } from "react";
import { GithubLogoIcon, MoonIcon, SunIcon } from "@phosphor-icons/react";
import { ErrorBoundary, PageSkeleton } from "@/components/loading";
import { PlaceSearch } from "@/components/place-search";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMeta } from "@/lib/data";
import { useI18n } from "@/lib/i18n";
import { Link } from "@/components/link";
import { parseRoute, usePathname } from "@/lib/router";
import { NotFoundPage } from "@/pages/not-found";
import { OverviewPage } from "@/pages/overview";
import { PlacePage } from "@/pages/place";

const REPO_URL = "https://github.com/DailyXplorer/jauge";

export function App() {
  const { t } = useI18n();
  const route = parseRoute(usePathname());
  const page =
    route.page === "overview" ? (
      <OverviewPage />
    ) : route.page === "place" ? (
      <PlacePage kind={route.kind} code={route.code} />
    ) : (
      <NotFoundPage />
    );

  return (
    <div className="flex min-h-svh flex-col">
      <Header />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        <ErrorBoundary fallback={<p className="py-24 text-center text-muted-foreground">{t("loadError")}</p>}>
          <Suspense fallback={<PageSkeleton />}>{page}</Suspense>
        </ErrorBoundary>
      </main>
      <Footer />
    </div>
  );
}

function Header() {
  const { t } = useI18n();
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="relative mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-6">
        <Link to="/" className="flex items-center gap-2 text-foreground">
          <LogoMark className="size-6" />
          <span className="text-lg leading-none font-medium tracking-tighter">jauge</span>
        </Link>
        <div className="order-last w-full lg:absolute lg:top-1/2 lg:left-1/2 lg:w-[420px] lg:-translate-x-1/2 lg:-translate-y-1/2">
          <Suspense fallback={<Skeleton className="h-9 w-full" />}>
            <SearchWithMeta />
          </Suspense>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer" aria-label={t("githubStarLabel")}>
              <GithubLogoIcon aria-hidden />
              {t("githubStar")}
            </a>
          </Button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

function SearchWithMeta() {
  return <PlaceSearch meta={useMeta()} />;
}

/** Gauge mark: a 270° dial with its needle. Single colour, follows `currentColor`. */
function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      <path d="M6.34 18.66A8 8 0 1 1 17.66 18.66" />
      <path d="M12 13l4-4" />
      <circle cx="12" cy="13" r="1" fill="currentColor" />
    </svg>
  );
}

function ThemeToggle() {
  const { t } = useI18n();
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("jauge.theme", next ? "dark" : "light");
    setDark(next);
  };
  return (
    <Button variant="outline" size="icon" className="size-8" onClick={toggle} aria-label={t("themeToggle")}>
      {dark ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
    </Button>
  );
}

function Footer() {
  const { t } = useI18n();
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-6 text-sm text-muted-foreground sm:px-6">
        <div className="space-y-1">
          <p>
            © {new Date().getFullYear()} Jauge contributors ·{" "}
            <a
              href={`${REPO_URL}/blob/main/LICENSE`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-4 hover:text-foreground hover:underline"
            >
              {t("footerLicence")}
            </a>
          </p>
          <p className="text-xs text-muted-foreground/70">{t("footerAttribution")}</p>
        </div>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub"
          className="rounded-md p-1.5 transition-colors hover:text-foreground"
        >
          <GithubLogoIcon className="size-5" aria-hidden />
        </a>
      </div>
    </footer>
  );
}
