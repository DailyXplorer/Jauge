import type { MouseEvent, ReactNode } from "react";
import { navigate } from "@/lib/router";

/** In-app link: client-side navigation on plain clicks, normal browser behaviour otherwise. */
export function Link({ to, className, children }: { to: string; className?: string; children: ReactNode }) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    navigate(to);
  };
  return (
    <a href={to} onClick={onClick} className={className}>
      {children}
    </a>
  );
}
