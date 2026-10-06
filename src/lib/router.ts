import { useSyncExternalStore } from "react";

export type PlaceKind = "region" | "department" | "city";

export type Route =
  | { page: "overview" }
  | { page: "about" }
  | { page: "place"; kind: PlaceKind; code: string }
  | { page: "notFound" };

const PLACE_KINDS: PlaceKind[] = ["region", "department", "city"];

export function parseRoute(pathname: string): Route {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return { page: "overview" };
  if (parts.length === 1 && parts[0] === "about") return { page: "about" };
  if (parts.length === 2 && PLACE_KINDS.includes(parts[0] as PlaceKind)) {
    return { page: "place", kind: parts[0] as PlaceKind, code: decodeURIComponent(parts[1]) };
  }
  return { page: "notFound" };
}

export function placePath(kind: PlaceKind, code: string): string {
  return `/${kind}/${encodeURIComponent(code)}`;
}

function subscribe(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

export function navigate(path: string) {
  if (path === window.location.pathname) return;
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo({ top: 0 });
}

const currentPathname = () => window.location.pathname;

export function usePathname(): string {
  return useSyncExternalStore(subscribe, currentPathname, currentPathname);
}
