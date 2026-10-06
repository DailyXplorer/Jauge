import { Suspense, useState } from "react";
import { MoonIcon, SunIcon } from "@phosphor-icons/react";
import { ErrorBoundary, PageSkeleton } from "@/components/loading";
import { PlaceSearch } from "@/components/place-search";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useMeta } from "@/lib/data";
import { useI18n, type Locale } from "@/lib/i18n";
import { Link } from "@/components/link";
import { parseRoute, usePathname } from "@/lib/router";
import { cn } from "@/lib/utils";
import { AboutPage } from "@/pages/about";
import { NotFoundPage } from "@/pages/not-found";
import { OverviewPage } from "@/pages/overview";
import { PlacePage } from "@/pages/place";

export function App() {
  const { t } = useI18n();
  const route = parseRoute(usePathname());
  const page =
    route.page === "overview" ? (
      <OverviewPage />
    ) : route.page === "about" ? (
      <AboutPage />
    ) : route.page === "place" ? (
      <PlacePage kind={route.kind} code={route.code} />
    ) : (
      <NotFoundPage />
    );

  return (
    <div className="flex min-h-svh flex-col">
      <Header active={route.page} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        <ErrorBoundary fallback={<p className="py-24 text-center text-muted-foreground">{t("loadError")}</p>}>
          <Suspense fallback={<PageSkeleton />}>{page}</Suspense>
        </ErrorBoundary>
      </main>
      <Footer />
    </div>
  );
}

function Header({ active }: { active: string }) {
  const { t } = useI18n();
  const navLink = (to: string, label: string, page: string) => (
    <Link
      to={to}
      className={cn(
        "rounded-md px-2.5 py-1.5 text-sm transition-colors hover:text-foreground",
        active === page ? "font-medium text-foreground" : "text-muted-foreground",
      )}
    >
      {label}
    </Link>
  );
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <Logo />
          <span className="text-lg font-semibold tracking-tight">Jauge</span>
          <span className="hidden text-sm text-muted-foreground md:inline">{t("appTagline")}</span>
        </Link>
        <nav className="ml-auto flex items-center gap-1">
          {navLink("/", t("navOverview"), "overview")}
          {navLink("/about", t("navAbout"), "about")}
        </nav>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <div className="flex-1 sm:flex-none">
            <Suspense fallback={<Skeleton className="h-9 w-full sm:w-72" />}>
              <SearchWithMeta />
            </Suspense>
          </div>
          <LocaleSwitch />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

function SearchWithMeta() {
  return <PlaceSearch meta={useMeta()} />;
}

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
      <rect width="32" height="32" rx="8" className="fill-foreground" />
      <path d="M8 21a8 8 0 0 1 16 0" fill="none" className="stroke-background" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M16 21l5-6" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="16" cy="21" r="2" fill="#f59e0b" />
    </svg>
  );
}

function LocaleSwitch() {
  const { locale, setLocale } = useI18n();
  return (
    <ToggleGroup
      type="single"
      size="sm"
      variant="outline"
      value={locale}
      onValueChange={(next) => next && setLocale(next as Locale)}
      aria-label="Language"
    >
      <ToggleGroupItem value="en" className="px-2.5 text-xs">
        EN
      </ToggleGroupItem>
      <ToggleGroupItem value="fr" className="px-2.5 text-xs">
        FR
      </ToggleGroupItem>
    </ToggleGroup>
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
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-8 text-sm text-muted-foreground sm:px-6">
        <p>
          {t("footerData")}{" "}
          <a
            href="https://www.etalab.gouv.fr/licence-ouverte-open-licence/"
            target="_blank"
            rel="noreferrer"
            className="underline-offset-4 hover:underline"
          >
            Licence Ouverte
          </a>
        </p>
        <p>{t("footerDisclaimer")}</p>
        <p>
          <Link to="/about" className="underline-offset-4 hover:underline">
            {t("navAbout")}
          </Link>
          {" · MIT · Jauge contributors"}
        </p>
      </div>
    </footer>
  );
}
