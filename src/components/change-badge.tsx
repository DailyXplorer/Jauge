import { ArrowDownRightIcon, ArrowRightIcon, ArrowUpRightIcon } from "@phosphor-icons/react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Price change in cents; rising prices read as bad news for drivers. */
export function ChangeBadge({ cents, label }: { cents: number | null; label: string }) {
  const { cents: formatCents } = useI18n();
  if (cents === null) return null;
  const rounded = Math.round(cents * 10) / 10;
  const Icon = rounded > 0 ? ArrowUpRightIcon : rounded < 0 ? ArrowDownRightIcon : ArrowRightIcon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium tabular-nums",
        rounded > 0 && "text-up",
        rounded < 0 && "text-down",
        rounded === 0 && "text-muted-foreground",
      )}
    >
      <Icon weight="bold" className="size-3.5" aria-hidden />
      {formatCents(rounded)}
      <span className="font-normal text-muted-foreground">{label}</span>
    </span>
  );
}
