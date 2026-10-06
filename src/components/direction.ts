import { ArrowDownRightIcon, ArrowRightIcon, ArrowUpRightIcon } from "@phosphor-icons/react";
import type { TrendDirection } from "@/domain/schema";

export const DIRECTION = {
  up: { icon: ArrowUpRightIcon, key: "trendUp", tone: "text-up bg-up/10" },
  down: { icon: ArrowDownRightIcon, key: "trendDown", tone: "text-down bg-down/10" },
  stable: { icon: ArrowRightIcon, key: "trendStable", tone: "text-muted-foreground bg-muted" },
} as const satisfies Record<TrendDirection, unknown>;
