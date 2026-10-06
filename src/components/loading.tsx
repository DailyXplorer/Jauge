import { Component, type ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export function CardSkeleton({ className = "h-80" }: { className?: string }) {
  return <Skeleton className={`w-full rounded-xl ${className}`} />;
}

export function KpiSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-32 rounded-xl" />
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-5 w-96 max-w-full" />
      </div>
      <KpiSkeleton />
      <CardSkeleton className="h-96" />
    </div>
  );
}

/** Shows `fallback` when a data file fails to load instead of blanking the page. */
export class ErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
