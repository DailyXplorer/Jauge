import { ArrowLeftIcon } from "@phosphor-icons/react";
import { useI18n } from "@/lib/i18n";
import { Link } from "@/components/link";

export function NotFoundPage() {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-start gap-4 py-24">
      <h1 className="text-3xl font-semibold tracking-tight">404</h1>
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" aria-hidden />
        {t("back")}
      </Link>
    </div>
  );
}
